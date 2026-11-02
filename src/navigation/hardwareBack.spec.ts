import {
  decideHardwareBack,
  subscribeHardwareBack,
  type BackHandlerLike,
  type WebBackState,
} from './hardwareBack'

/**
 * Android 하드웨어 뒤로가기 — 웹 안에서 한 칸 뒤로.
 *
 * 시나리오:
 *   1. 웹뷰에 뒤 칸이 있으면 웹뷰 goBack · 처리기가 사건을 먹는다(true) → 탭 이동 · 앱 종료 없음
 *   2. 뒤 칸이 없으면 지금 동작 그대로(false → 탭 규칙 · OS 기본)
 *   3. 오프라인 화면이 덮고 있으면 안 보이는 웹뷰를 되돌리지 않는다(false)
 *   4. 상태는 누르는 순간 읽는다 — 등록 뒤 웹 안 이동이 반영된다
 *   5. iOS 는 등록하지 않는다(무변화) · 플랫폼 기본값은 Platform.OS
 *   6. 해제하면 다시 안 불린다 — 보이는 탭만(포커스 잃으면 해제)
 *   7. 여러 탭이 차례로 포커스 — 늘 마지막(보이는) 탭 하나만 등록돼 있다
 */

/** BackHandler 흉내 — 나중에 붙은 처리기부터 부르고, true 면 멈춘다(RN 과 같은 순서) */
function fakeBackHandler() {
  const handlers: (() => boolean | null | undefined)[] = []
  const handler: BackHandlerLike = {
    addEventListener: (_e, fn) => {
      handlers.push(fn)
      return {
        remove: () => {
          const i = handlers.indexOf(fn)
          if (i >= 0) handlers.splice(i, 1)
        },
      }
    },
  }
  /** 뒤로 한 번 — 아무도 안 먹으면 'default'(탭 규칙 · OS) */
  const press = (): 'consumed' | 'default' => {
    for (let i = handlers.length - 1; i >= 0; i -= 1) {
      if (handlers[i]?.()) return 'consumed'
    }
    return 'default'
  }
  return { handler, press, count: () => handlers.length }
}

const state = (over: Partial<WebBackState> = {}): WebBackState => ({ canGoBack: false, offline: false, ...over })

describe('decideHardwareBack', () => {
  it('뒤 칸 있음 = 웹 뒤로 · 없음 = 지금 동작', () => {
    expect(decideHardwareBack(state({ canGoBack: true }))).toBe('webBack')
    expect(decideHardwareBack(state({ canGoBack: false }))).toBe('default')
  })

  it('오프라인 화면 = 뒤 칸이 있어도 지금 동작', () => {
    expect(decideHardwareBack(state({ canGoBack: true, offline: true }))).toBe('default')
    expect(decideHardwareBack(state({ canGoBack: false, offline: true }))).toBe('default')
  })
})

describe('subscribeHardwareBack', () => {
  it('1 · 2 뒤 칸 있으면 goBack + 먹음 · 없으면 안 먹음(goBack 안 부름)', () => {
    const fake = fakeBackHandler()
    const goBack = jest.fn()
    let s = state({ canGoBack: true })
    subscribeHardwareBack(() => s, goBack, { platform: 'android', handler: fake.handler })
    expect(fake.press()).toBe('consumed')
    expect(goBack).toHaveBeenCalledTimes(1)
    s = state({ canGoBack: false })
    expect(fake.press()).toBe('default')
    expect(goBack).toHaveBeenCalledTimes(1)
  })

  it('3 오프라인이면 안 먹음', () => {
    const fake = fakeBackHandler()
    const goBack = jest.fn()
    subscribeHardwareBack(() => state({ canGoBack: true, offline: true }), goBack, { platform: 'android', handler: fake.handler })
    expect(fake.press()).toBe('default')
    expect(goBack).not.toHaveBeenCalled()
  })

  it('4 상태는 누를 때 읽는다 — 등록 뒤 웹 안 이동(목록 → 한 질문)이 반영된다', () => {
    const fake = fakeBackHandler()
    const goBack = jest.fn()
    const live = { canGoBack: false, offline: false }
    subscribeHardwareBack(() => live, goBack, { platform: 'android', handler: fake.handler })
    expect(fake.press()).toBe('default')
    live.canGoBack = true
    expect(fake.press()).toBe('consumed')
    expect(goBack).toHaveBeenCalledTimes(1)
  })

  it('5 iOS 는 등록 0 · 해제 함수는 그냥 돈다', () => {
    const fake = fakeBackHandler()
    const unsub = subscribeHardwareBack(() => state({ canGoBack: true }), jest.fn(), { platform: 'ios', handler: fake.handler })
    expect(fake.count()).toBe(0)
    expect(() => unsub()).not.toThrow()
  })

  it('5-2 플랫폼을 안 넘기면 Platform.OS(jest-expo 기본 ios) — 등록 0', () => {
    const fake = fakeBackHandler()
    subscribeHardwareBack(() => state({ canGoBack: true }), jest.fn(), { handler: fake.handler })
    expect(fake.count()).toBe(0)
  })

  it('6 해제하면 다시 안 불린다(포커스 잃은 탭)', () => {
    const fake = fakeBackHandler()
    const goBack = jest.fn()
    const unsub = subscribeHardwareBack(() => state({ canGoBack: true }), goBack, { platform: 'android', handler: fake.handler })
    unsub()
    expect(fake.count()).toBe(0)
    expect(fake.press()).toBe('default')
    expect(goBack).not.toHaveBeenCalled()
  })

  it('7 탭 전환(보드 → 캘린더) — 보이는 탭의 웹뷰만 되돌린다', () => {
    const fake = fakeBackHandler()
    const boardBack = jest.fn()
    const calendarBack = jest.fn()
    // 보드 탭 포커스
    const unBoard = subscribeHardwareBack(() => state({ canGoBack: true }), boardBack, { platform: 'android', handler: fake.handler })
    // 캘린더 탭으로 — 보드는 포커스를 잃어 해제, 캘린더 등록
    unBoard()
    subscribeHardwareBack(() => state({ canGoBack: true }), calendarBack, { platform: 'android', handler: fake.handler })
    expect(fake.count()).toBe(1)
    expect(fake.press()).toBe('consumed')
    expect(calendarBack).toHaveBeenCalledTimes(1)
    expect(boardBack).not.toHaveBeenCalled()
  })
})
