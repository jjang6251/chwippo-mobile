import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

/**
 * 알림 soft-ask 게이트 — **앱 시작 + 가치 순간 공용** (⑦ notification-coverage Phase A).
 *
 * 판정 기준은 서버 사용자 플래그가 아니라 **기기 진실**(OS 권한).
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
 * ⚠️ **Android 는 status 를 신뢰할 수 없다 — expo 자체 캐시 함정.**
 * expo-modules-core 의 Android PermissionsService 는 "물어본 적 있음"을 OS 가 아니라
 * 자기 SharedPreferences(`mAskedPermissionsCache`)로 판정한다:
 *   `result != GRANTED && didAsk(permission) -> DENIED`, 그리고
 *   `canAskAgain = ActivityCompat.shouldShowRequestPermissionRationale(...)`
 * (PermissionsService.kt getPermissionResponseFromNativeResponse · canAskAgain)
 * 재설치 시 Auto Backup 이 이 캐시를 복원하면 OS 는 한 번도 안 물었는데
 * **status='denied' + canAskAgain=false**(rationale 은 never-asked 에서도 false)가 나온다.
 * 기존 `status !== 'undetermined' → false` 조건이 이 기기에서 soft-ask 를 영구 차단했다
 * (versionCode 9 · OS 플래그상 진짜 미결정인데 미노출 — 실기 확정).
 * → Android 는 status 구분을 버리고 `!granted` 로만 판정한다. 스팸은 2주 쿨다운 +
 *   세션 가드가 막고, Android 는 OS 팝업을 2회까지 허용해 소진 우려도 낮다.
 *   (영구 거부 기기는 '알림 받기'가 설정 딥링크로 폴백 — AppWebView handleSoftAskAllow)
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
 * soft-ask 노출 조건: 이번 세션 미노출 + 권한 게이트 통과 +
 * (기록 없음 또는 마지막 노출 2주 경과).
 *
 * 권한 게이트 (플랫폼 분기 — 근거는 파일 상단 '⚠️ Android' 참조):
 *   - iOS     : `status === 'undetermined'` — OS 팝업 평생 1회 소진 보호
 *   - Android : `!granted` — denied·undetermined 불문 (expo 의 status 구분 신뢰 불가)
 *
 * best-effort — 조회 실패 시 false (과다 노출 방지).
 */
export async function shouldShowValueMomentSoftAsk(
  now: number = Date.now(),
): Promise<boolean> {
  if (shownThisSession) return false // 세션당 1회 · 경로·탭 불문
  try {
    const { status, granted } = await Notifications.getPermissionsAsync()
    const permissionGateOpen =
      Platform.OS === 'android' ? !granted : status === 'undetermined'
    if (!permissionGateOpen) return false
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
