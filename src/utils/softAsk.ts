import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'

/**
 * "가치 순간" soft-ask 쿨다운 게이트 (⑦ notification-coverage Phase A).
 *
 * 웹에서 마감일을 저장하면(deadline-saved) 그 순간이 알림 권한을 청하기 좋은
 * 맥락이다. 다만 iOS OS 프롬프트는 평생 1회뿐이라 소진을 막아야 한다:
 *   - OS 권한이 undetermined(한 번도 안 물음)일 때만 커스텀 soft-ask 노출
 *   - 거절해도 2주 쿨다운 후 다음 가치 순간에 재노출 (로컬 앵커)
 *   - OS 프롬프트는 soft-ask '알림 받기' 승낙 시에만 실제 요청
 *
 * 쿨다운 앵커는 기기 로컬(AsyncStorage) — 서버 왕복 없이 판정. 모든 함수 best-effort.
 */

const KEY = 'softAskPromptedAt'
/** 거절 후 재노출까지 대기 (2주) */
export const SOFT_ASK_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000

/**
 * soft-ask 노출 조건: OS 권한 undetermined + (기록 없음 또는 마지막 노출 2주 경과).
 * best-effort — 조회 실패 시 false (과다 노출 방지).
 */
export async function shouldShowValueMomentSoftAsk(
  now: number = Date.now(),
): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync()
    if (status !== 'undetermined') return false // 이미 물음 → soft-ask 소진 방지
    const raw = await AsyncStorage.getItem(KEY)
    if (!raw) return true // 무기록 = 최초 가치 순간
    const last = Number(raw)
    if (!Number.isFinite(last)) return true
    return now - last >= SOFT_ASK_COOLDOWN_MS
  } catch {
    return false
  }
}

/** soft-ask 응답 기록 — 로컬 쿨다운 앵커 갱신 (best-effort). */
export async function recordValueMomentPrompt(
  now: number = Date.now(),
): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, String(now))
  } catch {
    // best-effort
  }
}
