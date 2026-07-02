import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'

/**
 * 인증 상태 · JWT 관리 (Zustand).
 *
 * SecureStore 로 실제 저장 · 상태는 메모리 mirror.
 * Kakao / SIWA 로그인 성공 시 setSession() 호출 → 자동 저장.
 * 로그아웃 시 clearAll() → SecureStore 삭제.
 *
 * refreshToken 은 백엔드가 httpOnly cookie 로 관리 · SecureStore 에는 X.
 * (axios `withCredentials: true` + cookie 저장은 native fetch 가 자동)
 */

export interface AuthUser {
  id: string
  nickname: string
  email: string | null
  role: string
  onboardedAt: string | null
  termsAgreedAt: string | null
  aiConsentAt: string | null
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  /** 앱 시작 시 auto-login 검증 중 · 완료 후 false */
  bootstrapping: boolean
  setSession: (token: string, user: AuthUser) => void
  setUser: (user: AuthUser) => void
  setBootstrapping: (v: boolean) => void
  /** JWT 만 복원 (auto-login bootstrap 초기 · user 정보는 me 로 갱신) */
  restoreToken: (token: string) => void
  clearAll: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  bootstrapping: true,

  setSession: (token, user) => {
    SecureStore.setItemAsync('jwt', token).catch((err) => {
      console.warn('[auth] SecureStore write failed:', err)
    })
    set({ token, user, bootstrapping: false })
  },

  setUser: (user) => set({ user }),

  setBootstrapping: (v) => set({ bootstrapping: v }),

  restoreToken: (token) => set({ token }),

  clearAll: async () => {
    try {
      await SecureStore.deleteItemAsync('jwt')
    } catch (err) {
      console.warn('[auth] SecureStore delete failed:', err)
    }
    set({ token: null, user: null, bootstrapping: false })
  },
}))
