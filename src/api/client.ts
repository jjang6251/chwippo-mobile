import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'
import { useAuthStore, type AuthUser } from '@/stores/authStore'

/**
 * API client — axios + JWT 자동 첨부 + 401 → refresh 자동 재시도.
 *
 * chwippo-back backend 호출.
 * refresh_token 은 서버가 httpOnly cookie 로 관리 · React Native 는 fetch 계층에서
 * 쿠키를 자동 저장·전송 (withCredentials 로 왕복).
 *
 * 401 정책 (웹 client.ts performRefresh 부품 이식):
 *   - 401 수신 → performNativeRefresh() 로 새 accessToken 획득 → 원요청 1회 재시도.
 *   - refresh 가 401(마스터키 만료·revoke·정지)일 때만 clearAll() → 로그인 화면.
 *   - refresh 가 409 소진·429·네트워크·타임아웃·epoch 변경 → 로그아웃 안 함
 *     (다음 폴링·요청이 자동 복구. 오프라인 보호 — 웹과 의도적 차별).
 */

const API_URL =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'https://api.chwippo.com'

// eslint-disable-next-line import/no-named-as-default-member
export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  withCredentials: true, // refresh cookie 왕복 · iOS/Android 모두 지원
})

/** 원요청 재시도 1회 가드 (무한 루프 방지) */
type RetryableConfig = InternalAxiosRequestConfig & { _retry?: boolean }

/** 백엔드 /auth/refresh 응답 — ResponseTransformInterceptor wrap({data,message}) 대응 */
interface RefreshResponseBody {
  data?: { accessToken?: string; user?: AuthUser }
  accessToken?: string
  user?: AuthUser
}

export interface RefreshResult {
  accessToken: string
  user: AuthUser
}

/**
 * 로그아웃·계정전환 중 늦게 도착한 refresh 응답이 setSession 을 호출하려 할 때 던지는
 * 전용 에러. `.response` 가 없어 인터셉터의 401 판정에 걸리지 않으므로 로그아웃되지 않음.
 */
class EpochChangedError extends Error {
  code = 'EPOCH_CHANGED'
  constructor() {
    super('refresh 응답 도착 전 인증 세대가 변경됨 (로그아웃·계정전환)')
    this.name = 'EpochChangedError'
  }
}

/**
 * 인터셉터 없는 plain axios — apiClient 를 타면 refresh 자체의 401 이 다시
 * 인터셉터로 들어가 무한 재귀. baseURL·timeout·withCredentials 만 갖는 순수 인스턴스.
 */
// eslint-disable-next-line import/no-named-as-default-member
const refreshClient = axios.create({
  baseURL: API_URL,
  timeout: 10000, // 🔴 필수 — RN 은 미명시 시 무기한 대기 → single-flight promise 영구 점유
  withCredentials: true,
})

/**
 * /auth/refresh single in-flight queue (웹 performRefresh 부품 이식).
 * - PR C rotation 으로 동시 N개 401 발생 시 첫 응답이 옛 token 무효화 → 나머지 fail → logout
 * - queue 로 1번만 호출 + 모든 caller 가 같은 결과 공유
 * - 성공·실패·타임아웃 모두 finally 에서 반드시 리셋 (미리셋 시 앱 재시작까지 401 복구 봉쇄)
 */
let refreshPromise: Promise<RefreshResult> | null = null

export async function performNativeRefresh(): Promise<RefreshResult> {
  if (refreshPromise) return refreshPromise
  refreshPromise = doNativeRefresh().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

async function doNativeRefresh(): Promise<RefreshResult> {
  // authEpoch 가드 — 시작 시 세대 캡처 → 응답 도착 시 재확인. 로그아웃/계정전환 중
  // 늦게 resolve 된 응답이 옛 토큰을 부활시키는 좀비 세션을 차단한다.
  const startEpoch = useAuthStore.getState().authEpoch

  // 409 = 동시 refresh 경합 (세션 지속성 토큰 패밀리) — 승자가 방금 쿠키를 갱신했으나
  // 이 요청이 옛 토큰으로 도착한 순간. 세션은 유효하므로 짧은 backoff 후 갱신된
  // 쿠키로 재시도하면 성공한다 (로그아웃 아님 · 백엔드 5초 grace 창 내).
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data } = await refreshClient.post<RefreshResponseBody>(
        '/auth/refresh',
        {},
      )
      const accessToken = data.data?.accessToken ?? data.accessToken
      const user = data.data?.user ?? data.user
      if (!accessToken || !user) {
        throw new Error('refresh 응답에 accessToken 또는 user 가 없습니다.')
      }
      // 응답 도착 시점에 세대가 바뀌었으면(로그아웃·A→B 전환) setSession 스킵 + 실패 처리.
      if (useAuthStore.getState().authEpoch !== startEpoch) {
        throw new EpochChangedError()
      }
      useAuthStore.getState().setSession(accessToken, user)
      return { accessToken, user }
    } catch (err) {
      lastErr = err
      const status = (err as AxiosError)?.response?.status
      if (status === 409 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
        continue // 갱신된 쿠키로 재시도
      }
      throw err // 401 등 인증 실패, epoch 변경, 또는 409 소진 → caller 처리
    }
  }
  throw lastErr
}

/** 401 → refresh-retry 대상에서 제외할 엔드포인트 (자기 자신·발급·로그아웃) */
const AUTH_RETRY_EXCLUDED = [
  '/auth/refresh',
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
    // Zustand 메모리 token 우선 — setSession 의 SecureStore write 가 fire-and-forget 이라
    // refresh 직후 재시도가 커밋 전 옛 토큰을 재독하는 race 차단. SecureStore 는
    // 콜드스타트(메모리 미복원) 폴백으로만.
    const token =
      useAuthStore.getState().token ?? (await SecureStore.getItemAsync('jwt'))
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
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
      original._retry = true
      try {
        await performNativeRefresh()
        // 요청 인터셉터가 Zustand 최신 token 을 자동 첨부 → 새 토큰으로 재시도
        return await apiClient(original)
      } catch (refreshErr) {
        // refresh 가 401(마스터키 만료·revoke·정지) → 진짜 세션 만료 → 여기서만 로그아웃.
        // 409 소진·429·네트워크·타임아웃·epoch 변경 → 로그아웃 안 함, 원요청 에러 전파.
        if ((refreshErr as AxiosError)?.response?.status === 401) {
          await useAuthStore.getState().clearAll()
        }
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  },
)
