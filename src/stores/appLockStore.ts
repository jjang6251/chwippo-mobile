import { create } from 'zustand'
import {
  getAppLockEnabled,
  isBiometricSupported,
  setAppLockEnabledStored,
} from '@/utils/appLock'

/**
 * ① 앱 잠금 상태 (Zustand) — 설정값 + 기기 지원 여부의 단일 소스.
 *
 *   - AppLockGate (게이트)가 잠금 여부를 판단할 때 읽음.
 *   - AppWebView 가 웹 설정 토글 브릿지(get/set-app-lock)를 처리할 때 읽고·씀.
 *
 * 실제 잠금 화면 노출/해제 흐름(콜드스타트·background 복귀·인증)은 AppLockGate 가
 * 로컬 상태 + AppState 로 관리. 이 store 는 "켜짐/지원" 사실만 보관.
 */

interface AppLockState {
  /** 사용자가 앱 잠금을 켰는지 (AsyncStorage 미러) */
  enabled: boolean
  /** 이 기기가 생체 인증 지원 + 등록돼 있는지 */
  supported: boolean
  /** hydrate 1회 완료 여부 */
  hydrated: boolean
  /** AsyncStorage + 생체 지원 여부 로드 (1회) */
  hydrate: () => Promise<void>
  /** 아직 hydrate 전이면 await, 이미 됐으면 즉시 반환 (브릿지 회신 정확성) */
  ensureHydrated: () => Promise<void>
  /** 앱 잠금 on/off — 저장 + 상태 반영 */
  setEnabled: (enabled: boolean) => Promise<void>
}

let hydratePromise: Promise<void> | null = null

export const useAppLockStore = create<AppLockState>((set, get) => ({
  enabled: false,
  supported: false,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return
    if (!hydratePromise) {
      hydratePromise = (async () => {
        const [enabled, supported] = await Promise.all([
          getAppLockEnabled(),
          isBiometricSupported(),
        ])
        set({ enabled, supported, hydrated: true })
      })()
    }
    await hydratePromise
  },

  ensureHydrated: async () => {
    if (get().hydrated) return
    await get().hydrate()
  },

  setEnabled: async (enabled) => {
    await setAppLockEnabledStored(enabled)
    set({ enabled })
  },
}))
