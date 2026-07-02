import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'

/**
 * 인증 상태 · JWT 관리 (Zustand).
 *
 * SecureStore 로 실제 저장 · 상태는 메모리 mirror.
 * Kakao / SIWA 로그인 성공 시 setToken() 호출 → 자동 저장.
 * 로그아웃 시 clearToken() → SecureStore 삭제.
 *
 * refreshToken 도 같은 방식 · 백엔드 응답에 따라.
 */

interface User {
  id: string
  email?: string
  nickname?: string
}

interface AuthState {
  token: string | null
  refreshToken: string | null
  user: User | null
  setToken: (token: string) => void
  setRefreshToken: (refreshToken: string) => void
  setUser: (user: User) => void
  clearAll: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  refreshToken: null,
  user: null,

  setToken: (token) => {
    SecureStore.setItemAsync('jwt', token).catch((err) => {
      console.warn('[auth] SecureStore write failed:', err)
    })
    set({ token })
  },

  setRefreshToken: (refreshToken) => {
    SecureStore.setItemAsync('refresh', refreshToken).catch((err) => {
      console.warn('[auth] SecureStore write failed:', err)
    })
    set({ refreshToken })
  },

  setUser: (user) => set({ user }),

  clearAll: async () => {
    try {
      await SecureStore.deleteItemAsync('jwt')
      await SecureStore.deleteItemAsync('refresh')
    } catch (err) {
      console.warn('[auth] SecureStore delete failed:', err)
    }
    set({ token: null, refreshToken: null, user: null })
  },
}))
