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
  /** 앱 시작 시 SecureStore 토큰 조회 중 · 완료 후 false */
  bootstrapping: boolean
  /**
   * 인증 세대 카운터 — clearAll·setSession 마다 +1.
   * 로그아웃·계정전환(A→B) 이후 도착한 갱신이 옛 토큰을 부활시키는 좀비 세션을
   * 차단하기 위한 세대 표식. (setToken 의 활성 세션 가드가 같은 계약)
   */
  authEpoch: number
  setSession: (token: string, user: AuthUser) => void
  /**
   * access token 만 갱신 (user·bootstrapping·세대 불변).
   * refresh 회전 주체가 웹뷰 하나이므로, 네이티브는 웹뷰가 브리지로 밀어 주는
   * `{type:'token'}` 을 통해서만 최신 access 를 받는다. (AppWebView onMessage 참조)
   */
  setToken: (token: string) => void
  setUser: (user: AuthUser) => void
  setBootstrapping: (v: boolean) => void
  /**
   * JWT 만 복원 (콜드스타트 낙관 진입 전용).
   * user 는 네이티브 소비처가 없어 채우지 않는다 — 세션 검증은 웹뷰가 담당.
   */
  restoreToken: (token: string) => void
  clearAll: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
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

  setToken: (token) => {
    // 🔴 활성 세션이 없으면 무시 — 로그아웃·계정전환 직후 늦게 도착한 웹뷰 token 이
    // 좀비 세션을 부활시키는 것을 막는다 (clearAll 이 token=null + authEpoch +1 로
    // 세대를 끊어 둔 상태). setSession 의 세대 가드와 같은 계약.
    if (!get().token) return
    // SecureStore write 는 setSession 과 동일하게 fire-and-forget (인터셉터가 메모리 우선)
    SecureStore.setItemAsync('jwt', token).catch((err) => {
      console.warn('[auth] SecureStore write failed:', err)
    })
    set({ token })
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
