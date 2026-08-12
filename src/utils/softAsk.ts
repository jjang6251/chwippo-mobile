import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'

/**
 * 알림 soft-ask 게이트 — **앱 시작 + 가치 순간 공용** (⑦ notification-coverage Phase A).
 *
 * 판정 기준은 서버 사용자 플래그가 아니라 **기기 진실**(OS 권한 undetermined).
 * 웹 로그인 시점 모달은 서버 alarmPromptedAt==null 게이트라 기기 변경·재설치
 * 사용자에게 영영 안 뜨고, 권한이 없으면 기기 등록이 스킵돼 Android 푸시가 통째로
 * 불능이었다 (2026-08-13 실기 확정).
 *
 * iOS OS 프롬프트는 평생 1회뿐이라 소진을 막아야 한다:
 *   - OS 권한이 undetermined(한 번도 안 물음)일 때만 커스텀 soft-ask 노출
 *   - 거절해도 2주 쿨다운 후 재노출 (로컬 앵커)
 *   - OS 프롬프트는 soft-ask '알림 받기' 승낙 시에만 실제 요청
 *   - 세션당 최대 1회 — 경로(앱 시작 · 가치 순간) · 탭 인스턴스 불문
 *
 * 쿨다운 앵커는 기기 로컬(AsyncStorage) — 서버 왕복 없이 판정. 모든 함수 best-effort.
 */

const KEY = 'softAskPromptedAt'
/** 거절 후 재노출까지 대기 (2주) */
export const SOFT_ASK_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000

/**
 * 이번 앱 실행에서 이미 soft-ask 를 띄웠는지 (프로세스 메모리 · 콜드스타트마다 리셋).
 * 탭마다 AppWebView 인스턴스가 따로 마운트되므로, 모달을 무시한 채 탭을 옮기면
 * 다른 인스턴스가 또 띄우는 다중 노출 구멍이 생긴다 — 그 구멍을 막는 가드.
 */
let shownThisSession = false

/**
 * soft-ask 노출 조건: 이번 세션 미노출 + OS 권한 undetermined +
 * (기록 없음 또는 마지막 노출 2주 경과).
 * best-effort — 조회 실패 시 false (과다 노출 방지).
 */
export async function shouldShowValueMomentSoftAsk(
  now: number = Date.now(),
): Promise<boolean> {
  if (shownThisSession) return false // 세션당 1회 · 경로·탭 불문
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

/**
 * soft-ask 를 실제로 화면에 띄우는 시점에 호출 — 세션 가드 + 쿨다운 앵커를 한 번에.
 *
 * ⭐ 앵커를 '버튼 응답' 이 아니라 '노출' 시점에 찍는다: 모달을 무시한 채 탭을 옮기면
 * 응답이 영영 안 와 앵커가 안 찍히고, 다음 인스턴스·다음 콜드스타트가 계속 띄운다.
 * (응답 시 recordValueMomentPrompt 재기록은 무해 — 앵커가 더 최신이 될 뿐)
 *
 * 세션 플래그는 동기 설정 — 이후 shouldShowValueMomentSoftAsk 는 즉시 false.
 */
export function markSoftAskShown(now: number = Date.now()): void {
  shownThisSession = true
  void recordValueMomentPrompt(now)
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
