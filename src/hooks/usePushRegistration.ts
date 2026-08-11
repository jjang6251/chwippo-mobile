import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import {
  hasRegisteredDevice,
  registerIfPermitted,
  syncPermissionState,
  unregisterCurrentDevice,
} from '@/utils/push'

/**
 * Push 토큰 등록 · 권한 상태 동기화. (mobile Step 2)
 *
 * 로그인(token) 상태 변화에 반응:
 *  - 로그인 · 앱 시작(세션 복원): OS 권한 상태 → PATCH /me/alarm-prompt 동기화
 *    + 이미 권한 있으면 Expo push token 자동 등록 (재프롬프트 없음)
 *  - 로그아웃: best-effort 기기 해제
 *
 * ⚠️ 내부 헬퍼 전부 best-effort · 실패해도 로그인/앱 흐름을 절대 깨지 않음.
 */
export function usePushRegistration(): void {
  // 🔴 token 문자열로 keying — 콜드스타트는 SecureStore 토큰으로 낙관 진입하므로
  // access 가 이미 만료였을 수 있고(네이티브는 더 이상 회전하지 않는다) 그 상태의 등록은
  // 401 로 조용히 실패한다. 웹뷰가 회전에 성공해 새 token 을 밀어 넣으면(setToken)
  // 이 effect 가 다시 돌아 회복한다 — 배지처럼 폴링으로 복구되는 경로가 없기 때문.
  // 등록이 이미 성공했으면 회전마다 재등록하지 않는다 (chatter 방지 · 권한 미승낙이라
  // 등록할 게 없는 계정만 회전당 권한 상태 동기화 1회를 반복한다).
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (!token) {
      void unregisterCurrentDevice()
      return
    }
    if (hasRegisteredDevice()) return
    // 로그인 · 권한 상태 서버 동기화 + 있으면 자동 등록
    void syncPermissionState()
    void registerIfPermitted()
  }, [token])
}
