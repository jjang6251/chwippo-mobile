import { BackHandler, Platform } from 'react-native'

/**
 * Android 하드웨어 뒤로가기 — 웹 화면 안에서 **한 칸 뒤로**(2026-10-29).
 *
 * 🔴 왜: 처리기가 하나도 없어서 뒤로를 누르면 웹 안 이동(목록 → 한 질문 · 보드 → 카드)과 상관없이
 * 탭 이동(`backBehavior="initialRoute"` → 홈 탭) · 홈이면 앱 종료가 됐다. 웹은 폰 화면을 주소 기록으로
 * 쌓아 두는데(면접 「한 질문 → 목록」 등) 앱에서만 그 기록이 안 쓰였다.
 *
 * 규칙: 지금 보이는 탭의 웹뷰가 뒤로 갈 수 있으면 웹뷰 `goBack()`(= 웹의 popstate) · 아니면 **지금 동작 그대로**
 * (처리기가 false 를 돌려 다음 처리기 → React Navigation 탭 규칙 → 홈 탭이면 OS 기본).
 * - 오프라인 화면이 웹뷰를 덮고 있으면 안 보이는 웹뷰를 되돌리지 않는다(지금 동작).
 * - iOS 는 하드웨어 뒤로가 없다 — 등록하지 않는다(무변화).
 * - 탭마다 웹뷰가 있어 **보이는(focus) 탭만** 등록한다 — 부르는 쪽이 `useFocusEffect` 안에서 등록 · 해제.
 */

export interface WebBackState {
  /** 웹뷰 기록에 뒤 칸이 있는가(`onNavigationStateChange` 의 canGoBack — Android 는 SPA 주소 바뀜에도 갱신) */
  canGoBack: boolean
  /** 오프라인 화면이 웹뷰를 덮고 있는가 */
  offline: boolean
}

export type HardwareBackAction = 'webBack' | 'default'

/** 순수 판정 */
export function decideHardwareBack(s: WebBackState): HardwareBackAction {
  if (s.offline) return 'default'
  return s.canGoBack ? 'webBack' : 'default'
}

/** `BackHandler` 중 쓰는 부분 — 시험이 가짜를 넣는다 */
export interface BackHandlerLike {
  addEventListener(
    eventName: 'hardwareBackPress',
    handler: () => boolean | null | undefined,
  ): { remove: () => void }
}

/**
 * 등록 → 해제 함수를 돌려준다(`useFocusEffect` 정리 함수로 그대로 쓰기 좋게).
 * 상태는 누를 때마다 `read()` 로 읽는다 — 등록 시점 값을 붙잡지 않는다(웹 안 이동은 등록 뒤에 일어난다).
 */
export function subscribeHardwareBack(
  read: () => WebBackState,
  goBack: () => void,
  opts: { platform?: string; handler?: BackHandlerLike } = {},
): () => void {
  if ((opts.platform ?? Platform.OS) !== 'android') return () => {}
  const sub = (opts.handler ?? BackHandler).addEventListener('hardwareBackPress', () => {
    if (decideHardwareBack(read()) !== 'webBack') return false
    goBack()
    return true
  })
  return () => sub.remove()
}
