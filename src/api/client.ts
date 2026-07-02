import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'
import { useAuthStore } from '@/stores/authStore'

/**
 * API client — axios + JWT 자동 첨부 + 401 auto-logout.
 *
 * chwippo-back backend 호출.
 * refresh_token 은 서버가 httpOnly cookie 로 관리 · React Native 는 fetch 계층에서
 * 쿠키를 자동 저장·전송 (withCredentials 없이도 native 동작).
 *
 * 401 정책: 현재는 즉시 로그아웃 (login 화면으로 redirect). W3+ 에 refresh 자동 시도 확장.
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

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await SecureStore.getItemAsync('jwt')
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
    if (error.response?.status === 401) {
      const clearAll = useAuthStore.getState().clearAll
      await clearAll()
    }
    return Promise.reject(error)
  },
)
