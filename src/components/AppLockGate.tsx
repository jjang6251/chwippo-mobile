import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { useAppLockStore } from '@/stores/appLockStore'
import { runBiometricAuth } from '@/utils/appLock'
import { AppLockScreen } from '@/components/AppLockScreen'

/**
 * ① 앱 잠금 게이트 — 앱 전체를 감싸 잠금 화면을 오버레이.
 *
 * ## 동작 (설정 ON + 생체 지원 기기에서만)
 *   - **콜드 스타트**: 마운트(hydrate 완료) 시 잠금 → 생체 인증 자동 트리거
 *   - **background 진입**: 즉시 'cover' 로 화면 가림 (앱 스위처 스냅샷 보호)
 *   - **foreground 복귀**: 잠금 → 생체 인증 자동 트리거
 *   - 인증 성공 전까지 오버레이가 콘텐츠를 완전히 가림 (불투명)
 *   - 인증 실패·취소 → 잠금 유지 · "잠금 해제" 버튼으로 재시도
 *
 * ## 안전 통과 (먹통 방지 · Apple 4.2)
 *   - 생체 미지원/미등록(supported=false)이면 설정이 켜져 있어도 잠그지 않음
 *   - 저장소·인증 오류는 전부 열림(hidden) 방향으로 폴백
 *
 * ## Face ID 프롬프트 재진입 루프 방지
 *   - 인증 중(authingRef)에는 AppState 전이를 무시 → OS 프롬프트가 유발하는
 *     inactive/active 이벤트로 재잠금·재트리거가 발생하지 않음
 *   - snapshot 보호는 'background' 에서만 (inactive 는 무시) → 다른 시스템
 *     다이얼로그(권한 등)로 잠금 화면이 깜빡이지 않음
 */

type Overlay = 'hidden' | 'cover' | 'lock'

export function AppLockGate({ children }: { children: React.ReactNode }) {
  const hydrated = useAppLockStore((s) => s.hydrated)
  const enabled = useAppLockStore((s) => s.enabled)
  const supported = useAppLockStore((s) => s.supported)
  const hydrate = useAppLockStore((s) => s.hydrate)

  const [overlay, setOverlay] = useState<Overlay>('hidden')

  const authingRef = useRef(false)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)
  const pendingLockRef = useRef(false)

  const runAuth = useCallback(async () => {
    if (authingRef.current) return
    authingRef.current = true
    const ok = await runBiometricAuth()
    authingRef.current = false
    setOverlay(ok ? 'hidden' : 'lock')
  }, [])

  // hydrate 1회 (AsyncStorage + 생체 지원 여부)
  useEffect(() => {
    void hydrate()
  }, [hydrate])

  // 콜드 스타트 잠금 — hydrate 완료 후 1회만
  const coldDoneRef = useRef(false)
  useEffect(() => {
    if (!hydrated || coldDoneRef.current) return
    coldDoneRef.current = true
    if (enabled && supported) {
      setOverlay('lock')
      void runAuth()
    }
  }, [hydrated, enabled, supported, runAuth])

  // AppState — background 가림 + foreground 재잠금
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current
      appStateRef.current = next
      if (!enabled || !supported) return
      // 인증 중 OS 프롬프트가 유발하는 inactive/active 전이는 무시 (루프 방지)
      if (authingRef.current) return
      if (next === 'background') {
        setOverlay('cover')
        pendingLockRef.current = true
      } else if (next === 'active' && prev === 'background' && pendingLockRef.current) {
        pendingLockRef.current = false
        setOverlay('lock')
        void runAuth()
      }
    })
    return () => sub.remove()
  }, [enabled, supported, runAuth])

  return (
    <>
      {children}
      {overlay !== 'hidden' && (
        <AppLockScreen onUnlock={() => void runAuth()} />
      )}
    </>
  )
}
