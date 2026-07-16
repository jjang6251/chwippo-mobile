import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import {
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
  // boolean 로그인 여부로 keying — 시간당 accessToken rotation(문자열 변경)마다
  // 재등록 chatter 가 발생하지 않도록 로그인↔로그아웃 전이에만 반응.
  const isLoggedIn = useAuthStore((s) => !!s.token)

  useEffect(() => {
    if (!isLoggedIn) {
      void unregisterCurrentDevice()
      return
    }
    // 로그인 · 권한 상태 서버 동기화 + 있으면 자동 등록
    void syncPermissionState()
    void registerIfPermitted()
  }, [isLoggedIn])
}
