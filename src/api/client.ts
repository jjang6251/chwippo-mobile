import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'
import { useAuthStore } from '@/stores/authStore'

/**
 * API client — axios + JWT 자동 첨부.
 *
 * chwippo-back backend 호출.
 * refresh_token 은 서버가 httpOnly cookie 로 관리 · React Native 는 fetch 계층에서
 * 쿠키를 자동 저장·전송 (withCredentials 로 왕복).
 *
 * 401 정책 (refresh 회전 단일 주체화 — 회전은 웹뷰가 전담):
 *   - 🔴 네이티브는 /auth/refresh 를 호출하지 않는다. 회전 주체가 둘이면 시간차로
 *     구세대 RT 재사용이 발생해 서버가 토큰 체인을 revoke → 오탐 로그아웃.
 *   - 401 = 조용한 실패. 로그아웃 판정은 전적으로 웹뷰 몫 — 웹 handleAuthFailure 가
 *     401 확정 시 postMessage({type:'logout'}) → AppWebView 가 clearAll → 로그인 화면.
 *   - 단 웹뷰가 그 사이 회전에 성공해 {type:'token'} 으로 새 access 를 밀어 넣었으면
 *     그 토큰으로 원요청 1회만 재발사 (setToken → authStore 메모리).
 *   - 재발사 못 하면 실패를 그대로 전파 — 배지는 60s 폴링, 푸시 등록은 다음 로그인
 *     전이에서 자연 회복하고, 웹뷰 회전이 곧 새 token 을 공급한다.
 */

export const API_URL =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'https://api.chwippo.com'

// eslint-disable-next-line import/no-named-as-default-member
export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  withCredentials: true, // refresh cookie 왕복 · iOS/Android 모두 지원
})

/**
 * 원요청 재발사 1회 가드 (무한 루프 방지) + 발사 시점에 첨부한 token 기록.
 * `_sentToken` 이 있어야 "401 이후 웹뷰가 새 token 을 밀어 넣었는가"를 판정할 수 있다.
 */
type RetryableConfig = InternalAxiosRequestConfig & {
  _retry?: boolean
  _sentToken?: string | null
}

/** 401 → 재발사 대상에서 제외할 엔드포인트 (발급·로그아웃 — 재시도가 무의미하거나 위험) */
const AUTH_RETRY_EXCLUDED = [
  '/auth/kakao/native',
  '/auth/apple/native',
  '/auth/reviewer-login',
  '/auth/logout',
]

function isAuthRetryExcluded(url: string | undefined): boolean {
  if (!url) return false
  return AUTH_RETRY_EXCLUDED.some((p) => url.includes(p))
}

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Zustand 메모리 token 우선 — setSession·setToken 의 SecureStore write 가
    // fire-and-forget 이라 갱신 직후 재발사가 커밋 전 옛 토큰을 재독하는 race 차단.
    // SecureStore 는 콜드스타트(메모리 미복원) 폴백으로만.
    const token =
      useAuthStore.getState().token ?? (await SecureStore.getItemAsync('jwt'))
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    ;(config as RetryableConfig)._sentToken = token ?? null
    return config
  },
)

apiClient.interceptors.response.use(
  (response) => {
    // 백엔드 ResponseTransformInterceptor 가 { data, message } 로 wrap
    // 클라이언트는 항상 실제 페이로드만 쓰도록 자동 unwrap
    if (
      response.data &&
      typeof response.data === 'object' &&
      'data' in response.data &&
      'message' in response.data
    ) {
      response.data = (response.data as { data: unknown }).data
    }
    return response
  },
  async (error: AxiosError) => {
    const original = error.config as RetryableConfig | undefined

    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !isAuthRetryExcluded(original.url)
    ) {
      // 요청이 날아간 사이 웹뷰가 회전에 성공해 새 access 를 밀어 넣었으면 그걸로 1회 재발사.
      // (요청 인터셉터가 Zustand 최신 token 을 자동 첨부한다)
      // 토큰이 그대로면 재발사해도 같은 401 → 조용히 실패시키고 웹뷰 회전을 기다린다.
      // 🔴 여기서 절대 refresh 를 돌리거나 로그아웃시키지 않는다 — 회전·만료 판정은 웹뷰 단독.
      const latest = useAuthStore.getState().token
      if (latest && latest !== original._sentToken) {
        original._retry = true
        return await apiClient(original)
      }
    }

    return Promise.reject(error)
  },
)
