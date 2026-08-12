import { Linking, Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { registerDevice, deleteDevice } from '@/api/devices'
import { syncAlarmPrompt } from '@/api/notifications'

/**
 * Push 권한 · 토큰 등록 헬퍼 (플랫폼 · 서버 계약을 한 곳에 모음).
 *
 * ⚠️ 모든 함수 best-effort — 실패해도 throw 하지 않아 로그인/앱 흐름을 절대 깨지 않는다.
 * (usePushRegistration · AppWebView soft-ask 브릿지가 공용으로 사용)
 */

/** 마지막으로 서버에 등록한 Expo push token · 로그아웃 시 해제에 사용 */
let lastRegisteredToken: string | null = null

/**
 * 이번 로그인 세션에서 서버 기기 등록이 성공했는지.
 * 콜드스타트 낙관 진입 시 access 가 만료였으면 등록이 401 로 조용히 실패하는데,
 * 웹뷰 회전이 새 token 을 밀어 넣었을 때 재시도할지 판정하는 데 쓴다.
 * (usePushRegistration 참조)
 */
export function hasRegisteredDevice(): boolean {
  return lastRegisteredToken !== null
}

function getProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined
  return extra?.eas?.projectId
}

async function getExpoToken(): Promise<string | null> {
  try {
    const projectId = getProjectId()
    const res = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    )
    return res.data
  } catch {
    // projectId 미설정 · 시뮬레이터 · 네트워크 등 · 등록 skip
    return null
  }
}

/**
 * 🔴 Android 알림 채널 보장 — 채널이 없으면 Android 8+ 가 도착한 알림을 **조용히 버린다.**
 * 2026-08-12 실기 확정: FCM 영수증 ok 인데 표시 0건, dumpsys 로 채널 0개 실측.
 * Expo 발송(channelId 미지정)은 'default' 채널을 찾으므로 그 id 로 생성해야 한다.
 * 멱등(이미 있으면 갱신) · best-effort. iOS 는 채널 개념 없음 — no-op.
 */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: '일정 알림',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    })
  } catch {
    // 채널 생성 실패 시에도 앱 흐름 유지 (다음 등록 시 재시도)
  }
}

/** 현재 기기 Expo push token 을 서버에 등록 (권한 있을 때만 호출). best-effort. */
export async function registerCurrentDevice(): Promise<void> {
  try {
    await ensureAndroidChannel()
    const expoToken = await getExpoToken()
    if (!expoToken) return
    await registerDevice({
      deviceToken: expoToken,
      platform: Platform.OS === 'android' ? 'android' : 'ios',
      appVersion: Constants.expoConfig?.version ?? undefined,
    })
    lastRegisteredToken = expoToken
  } catch {
    // 등록 실패 · 흐름 유지
  }
}

/** 로그아웃 시 best-effort 기기 해제. */
export async function unregisterCurrentDevice(): Promise<void> {
  const token = lastRegisteredToken
  lastRegisteredToken = null
  if (!token) return
  await deleteDevice(token).catch(() => {})
}

/**
 * OS 권한 상태 → 서버 동기화.
 * iOS 설정에서 사용자가 알림을 꺼둔 경우의 통계 왜곡 방지 (plan 지침 #10).
 * 호출 측에서 로그인(token) 확인 후 사용.
 *
 * ⚠️ undetermined(한 번도 프롬프트 안 뜸)일 땐 호출 금지 —
 * PATCH /me/alarm-prompt 가 alarmPromptedAt 을 찍어 soft-ask 모달 조건
 * (alarmPromptedAt == null) 을 영영 소멸시킴 (2026-07-11 실기 발견).
 */
export async function syncPermissionState(): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync()
    if (status === 'undetermined') return
    await syncAlarmPrompt(status === 'granted')
  } catch {
    // best-effort
  }
}

/** 이미 권한이 있으면 자동 등록 (재프롬프트 없음). */
export async function registerIfPermitted(): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync()
    if (status === 'granted') await registerCurrentDevice()
  } catch {
    // best-effort
  }
}

/**
 * 웹 설정 "알림 권한 설정" CTA — 상태별 분기.
 *  - undetermined: iOS 설정에 알림 항목이 아직 없어 설정 이동은 막다른 길 →
 *    OS 프롬프트 직접 요청 (soft-ask 못 본 계정의 복구 경로 겸용)
 *  - granted/denied: 앱 알림 설정 화면으로 이동 (iOS 재프롬프트 불가 대응)
 */
export async function openNotificationSettingsOrRequest(): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync()
    if (status === 'undetermined') {
      await requestPermissionAndRegister()
      return
    }
  } catch {
    // 상태 조회 실패 · 설정 폴백
  }
  Linking.openSettings().catch(() => {})
}

/**
 * soft-ask "알림 받기" → OS 권한 요청 → 상태 동기화 + 승낙 시 기기 등록.
 * @returns granted 여부
 */
export async function requestPermissionAndRegister(): Promise<boolean> {
  try {
    const { status } = await Notifications.requestPermissionsAsync()
    const granted = status === 'granted'
    await syncAlarmPrompt(granted).catch(() => {})
    if (granted) await registerCurrentDevice()
    return granted
  } catch {
    return false
  }
}
