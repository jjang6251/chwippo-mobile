import AsyncStorage from '@react-native-async-storage/async-storage'
import * as LocalAuthentication from 'expo-local-authentication'

/**
 * ① Face ID / Touch ID 앱 잠금 — 기기 단위 설정 + 생체 인증 헬퍼.
 *
 * ## 저장
 *   - AsyncStorage `chwippo:app-lock` = '1'(on) / 없음·그 외(off)
 *   - 기기 단위 (계정 무관 · 로그아웃해도 유지). SecureStore 가 아닌 이유:
 *     민감 비밀이 아니라 on/off 플래그일 뿐 · 잠금 판단은 실제 생체 인증이 담당.
 *
 * ## 지원 여부 (Apple 4.2 · 먹통 방지)
 *   - hasHardwareAsync && isEnrolledAsync 둘 다 true 여야 "지원".
 *   - 생체 미등록·미지원이면 설정 토글 자체를 노출하지 않고, 이미 켜져 있던 경우도
 *     잠금 게이트가 안전 통과 (잠긴 채 먹통 금지).
 */

export const APP_LOCK_KEY = 'chwippo:app-lock'

/** 저장된 앱 잠금 on/off (기본 off) */
export async function getAppLockEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(APP_LOCK_KEY)) === '1'
  } catch {
    // 저장소 접근 실패 → 안전하게 off (잠금 먹통 방지)
    return false
  }
}

/** 앱 잠금 on/off 저장 */
export async function setAppLockEnabledStored(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await AsyncStorage.setItem(APP_LOCK_KEY, '1')
    } else {
      await AsyncStorage.removeItem(APP_LOCK_KEY)
    }
  } catch {
    // 저장 실패는 조용히 무시 · 다음 시도에서 재반영
  }
}

/** 이 기기가 생체 인증(Face ID / Touch ID)을 지원 + 등록돼 있는지 */
export async function isBiometricSupported(): Promise<boolean> {
  try {
    const [hasHardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ])
    return hasHardware && enrolled
  } catch {
    return false
  }
}

/**
 * 생체 인증 실행 — 성공 여부만 반환.
 * disableDeviceFallback 미설정(false) → 생체 반복 실패 시 기기 암호로 폴백 (잠금 먹통 방지).
 */
export async function runBiometricAuth(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: '치뽀 잠금을 해제하려면 인증하세요',
      cancelLabel: '취소',
    })
    return result.success
  } catch {
    return false
  }
}
