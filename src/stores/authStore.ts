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
  /**
   * 인증 세대 카운터 — clearAll·setSession 마다 +1.
   * performNativeRefresh 가 시작 시 이 값을 캡처 → 응답 도착 시 재확인해,
   * 로그아웃·계정전환(A→B) 중 늦게 resolve 된 refresh 가 옛 토큰을 부활시키는
   * 좀비 세션을 차단한다. (client.ts performNativeRefresh 참조)
   */
  authEpoch: number
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
  authEpoch: 0,

  setSession: (token, user) => {
    // ⚠️ SecureStore write 는 fire-and-forget (await 안 함) — 계약: 인터셉터가
    // Zustand 메모리 token 을 우선 읽으므로 커밋 지연으로 인한 옛 토큰 재독 race 없음.
    // (client.ts 요청 인터셉터가 useAuthStore token 우선 · SecureStore 는 콜드스타트 폴백)
    SecureStore.setItemAsync('jwt', token).catch((err) => {
      console.warn('[auth] SecureStore write failed:', err)
    })
    set((s) => ({ token, user, bootstrapping: false, authEpoch: s.authEpoch + 1 }))
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
    set((s) => ({
      token: null,
      user: null,
      bootstrapping: false,
      authEpoch: s.authEpoch + 1,
    }))
  },
}))
