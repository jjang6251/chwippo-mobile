import { create } from 'zustand'

/**
 * WebView 네비게이션 인텐트 브릿지.
 *
 * NativeHeader 종 탭 · push 알림 딥링크 → 현재 focus 된 AppWebView 가
 * 자신의 location.href 를 target path 로 이동시키도록 신호를 전달한다.
 *
 * nonce 는 같은 target 을 연속 요청해도 (예: 알림 두 번 탭) 구독 effect 가
 * 다시 실행되도록 만드는 트리거. AppWebView 는 focus 상태일 때만 반응한다.
 */
interface WebNavState {
  target: string | null
  nonce: number
  requestNavigate: (path: string) => void
}

export const useWebNavStore = create<WebNavState>((set) => ({
  target: null,
  nonce: 0,
  requestNavigate: (path) =>
    set((s) => ({ target: path, nonce: s.nonce + 1 })),
}))
