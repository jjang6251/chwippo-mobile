import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'
import { useAuthStore } from '@/stores/authStore'

/**
 * API client — axios + JWT 자동 첨부 + refresh 처리.
 *
 * chwippo-back backend 호출.
 * W3 에 refresh token 로직 완성 (401 → refresh → 재시도).
 * W2 shell 단계 = 기본 첨부만.
 */

const API_URL = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'https://api.chwippo.com'

// eslint-disable-next-line import/no-named-as-default-member
export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 10000,
})

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await SecureStore.getItemAsync('jwt')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    // W3: 401 시 refresh token 으로 재발급 시도
    if (error.response?.status === 401) {
      const clearAll = useAuthStore.getState().clearAll
      await clearAll()
    }
    return Promise.reject(error)
  },
)
