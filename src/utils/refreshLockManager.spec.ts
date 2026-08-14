/**
 * refreshLockManager 계약 spec — 모듈 상단 「상태 전이 표」를 그대로 옮긴다.
 *
 * 이 레포의 첫 spec 이다. R2 아크 내내 검증 수단이 logcat 실측뿐이라 상태 기계 오판이
 * 반복됐고(vc12~vc15), 이 모듈은 react-native 를 하나도 import 하지 않는 순수 TS 라
 * 하네스만 얹으면 그대로 잠글 수 있다.
 *
 * ## 모듈 레벨 상태 격리
 * 이 모듈은 싱글턴이다 — webviews Map · activeWebviews Set · queue · holder · holderTimer 가
 * 전부 모듈 스코프에 산다. 테스트 간 오염을 막기 위해 매 테스트마다 `jest.resetModules()` 로
 * 레지스트리를 비우고 **새 모듈 인스턴스**를 받는다. 프로덕션에 `__resetForTest` 같은
 * 표면을 추가하지 않기 위한 선택이다 (프론트 client.ts 의 test-only reset 선례가 있으나,
 * 여기선 export 를 늘리지 않고 끝낼 수 있다).
 *
 * ## 로그가 곧 계약
 * 계측 로그는 실기(logcat)에서 "재개 시 락 요청 N건 → HTTP 회전 1건" 을 확인하는 유일한
 * 증거다(프로덕션 웹 번들엔 console 이 없다). 그래서 spy 로 조용히 시키되 **문구 자체를
 * 단언**한다 — 포맷이 바뀌면 vc16 판정 절차가 깨진다.
 *
 * ## 주입 페이로드가 곧 계약
 * register 의 injectFn 은 jest.fn 으로 주입해, 어느 웹뷰에 어떤 이벤트가 어떤 detail 로
 * 갔는지 파싱해 단언한다.
 */

type LockModule = typeof import('./refreshLockManager')

const GRANT = 'chwippo:refresh-lock-grant'
const QUEUED = 'chwippo:refresh-lock-queued'
const BROADCAST = 'chwippo:token-broadcast'

const HOLDER_TIMEOUT_MS = 30000

interface InjectedEvent {
  name: string
  detail: Record<string, unknown>
}

interface FakeWebview {
  id: string
  inject: jest.Mock<void, [string]>
}

/** injectEvent 가 만드는 JS 한 줄에서 이벤트 이름·detail 을 되꺼낸다 */
const CUSTOM_EVENT_RE = /new CustomEvent\((".*?"), \{ detail: (.*) \}\)\);/

function parseInjected(js: string): InjectedEvent {
  const matched = CUSTOM_EVENT_RE.exec(js)
  const rawName = matched?.[1]
  const rawDetail = matched?.[2]
  if (rawName === undefined || rawDetail === undefined) {
    throw new Error(`주입된 JS 가 CustomEvent 형태가 아니다:\n${js}`)
  }
  const name: unknown = JSON.parse(rawName)
  const detail: unknown = JSON.parse(rawDetail)
  if (typeof name !== 'string') throw new Error(`이벤트 이름이 문자열이 아니다: ${rawName}`)
  if (typeof detail !== 'object' || detail === null) {
    throw new Error(`detail 이 객체가 아니다: ${rawDetail}`)
  }
  return { name, detail: detail as Record<string, unknown> }
}

function eventsOf(webview: FakeWebview): InjectedEvent[] {
  return webview.inject.mock.calls.map(([js]) => parseInjected(js))
}

function eventNamesOf(webview: FakeWebview): string[] {
  return eventsOf(webview).map((event) => event.name)
}

function eventsNamed(webview: FakeWebview, name: string): InjectedEvent[] {
  return eventsOf(webview).filter((event) => event.name === name)
}

describe('refreshLockManager', () => {
  let lock: LockModule
  let logs: string[]
  let logSpy: jest.SpyInstance

  function mount(id: string): FakeWebview {
    const inject = jest.fn<void, [string]>()
    lock.register(id, inject)
    return { id, inject }
  }

  beforeEach(() => {
    logs = []
    logSpy = jest.spyOn(console, 'log').mockImplementation((message?: unknown) => {
      logs.push(String(message))
    })
    jest.useFakeTimers()
    jest.resetModules()
    // resetModules 직후의 로드라 매번 새 인스턴스다. dynamic `import()` 는 쓸 수 없다 —
    // babel-preset-expo 가 이를 실제 ESM import 로 남겨 두는데 jest 는
    // --experimental-vm-modules 없이 이를 실행하지 못한다. `jest.requireActual<T>` 는
    // 같은 모듈 레지스트리를 타면서 타입까지 유지된다 (bare `require` + 캐스팅 회피).
    lock = jest.requireActual<LockModule>('./refreshLockManager')
  })

  afterEach(() => {
    // 가짜 시계로 되돌리면 grant 가 걸어 둔 30s holder 타이머도 함께 버려진다.
    jest.useRealTimers()
    logSpy.mockRestore()
  })

  // ── 1행: request · 요청자 활성 / holder 없음 ────────────────────────────────
  it('holder 가 없고 요청자가 활성이면 그 웹뷰에만 grant 한다', () => {
    const a = mount('wvA')
    const b = mount('wvB')
    lock.setActive('wvA', true)

    lock.handleLockRequest('wvA', 'r1')

    expect(eventsOf(a)).toEqual([{ name: GRANT, detail: { reqId: 'r1' } }])
    expect(b.inject).not.toHaveBeenCalled()
    expect(logs).toContain('[refreshLock] grant → wvA (활성 · 대기 0)')
  })

  // ── 2행: request · 요청자 비활성 (활성 웹뷰 있음) / holder 없음 ─────────────
  it('holder 가 없어도 비활성 요청자에겐 grant 하지 않고 큐 + queued 회신한다', () => {
    const a = mount('wvA')
    const b = mount('wvB')
    lock.setActive('wvA', true)

    lock.handleLockRequest('wvB', 'r2')

    expect(eventsOf(b)).toEqual([{ name: QUEUED, detail: { reqId: 'r2' } }])
    expect(a.inject).not.toHaveBeenCalled()
    expect(logs).toContain('[refreshLock] queue wvB (비활성 · holder=없음 · 대기 1)')
  })

  // ── 3행: request · 활성 웹뷰 0 (폴백) ───────────────────────────────────────
  it('활성 웹뷰가 0개면 (focus 보고 실패 폴백) 비활성 요청자에게도 선착순 grant 한다', () => {
    const a = mount('wvA')
    const b = mount('wvB')

    lock.handleLockRequest('wvB', 'r3')

    expect(eventsOf(b)).toEqual([{ name: GRANT, detail: { reqId: 'r3' } }])
    expect(logs).toContain('[refreshLock] grant → wvB (비활성 · 대기 0)')

    // 선착순이므로 뒤에 온 요청은 holder 뒤에 줄 선다
    lock.handleLockRequest('wvA', 'r4')
    expect(eventsOf(a)).toEqual([{ name: QUEUED, detail: { reqId: 'r4' } }])
  })

  // ── 1행 우측: holder 있음 + 활성 요청자 ─────────────────────────────────────
  it('holder 가 있으면 활성 요청자라도 큐 + queued 회신한다', () => {
    const a = mount('wvA')
    const b = mount('wvB')
    lock.setActive('wvA', true)
    lock.setActive('wvB', true)

    lock.handleLockRequest('wvA', 'r1')
    lock.handleLockRequest('wvB', 'r2')

    expect(eventsOf(a)).toEqual([{ name: GRANT, detail: { reqId: 'r1' } }])
    expect(eventsOf(b)).toEqual([{ name: QUEUED, detail: { reqId: 'r2' } }])
    expect(logs).toContain('[refreshLock] queue wvB (활성 · holder=wvA · 대기 1)')
  })

  // ── 5행: setActive(holder, false) + 활성 대기자 존재 ────────────────────────
  it('holder 가 비활성이 되면 회수하고 큐의 **활성** 대기자에게 승계한다 (FIFO 아님)', () => {
    const a = mount('wvA')
    const b = mount('wvB')
    const c = mount('wvC')
    lock.setActive('wvA', true)

    lock.handleLockRequest('wvA', 'r1') // grant (활성)
    lock.handleLockRequest('wvB', 'r2') // 큐 1번 — 비활성
    lock.handleLockRequest('wvC', 'r3') // 큐 2번 — 비활성
    lock.setActive('wvC', true) // holder(A) 는 아직 활성 → 변화 없음
    expect(eventsNamed(c, GRANT)).toHaveLength(0)

    lock.setActive('wvA', false)

    // 큐 앞쪽 B(비활성)를 건너뛰고 뒤쪽 C(활성)가 받는다
    expect(eventsNamed(c, GRANT)).toEqual([{ name: GRANT, detail: { reqId: 'r3' } }])
    expect(eventsNamed(b, GRANT)).toHaveLength(0)
    expect(eventNamesOf(a)).toEqual([GRANT])
    expect(logs).toContain('[refreshLock] holder 비활성 전환 (wvA) → 회수')
    expect(logs).toContain('[refreshLock] grant → wvC (활성 · 대기 1)')
  })

  // ── 5행 단서: setActive(holder, false) + 활성 웹뷰 0 → 유지 ─────────────────
  it('holder 가 비활성이 됐어도 활성 웹뷰가 0개면 회수하지 않는다 (blur→focus 찰나 보호)', () => {
    const a = mount('wvA')
    const b = mount('wvB')
    lock.setActive('wvA', true)
    lock.handleLockRequest('wvA', 'r1')
    lock.handleLockRequest('wvB', 'r2')

    lock.setActive('wvA', false)

    expect(eventsNamed(b, GRANT)).toHaveLength(0)
    expect(logs).not.toContain('[refreshLock] holder 비활성 전환 (wvA) → 회수')

    // holder 가 그대로 A 임을 release 경로로 확증한다 —
    // 회수됐다면 "release 무시" 가 찍힌다.
    lock.handleLockRelease('r1')
    expect(logs).toContain('[refreshLock] release wvA → 승계 (대기 1)')
    expect(eventNamesOf(a)).toEqual([GRANT])

    /*
      🔴 그리고 그 승계에서 **배경 웹뷰 B 가 락을 받아서는 안 된다.** holder 해제 뒤
      promoteNext 가 도는데, 폴백 판정이 `활성 0` 하나뿐이면 여기서 얼어붙은 B 가 grant 를
      받는다 — 회수를 막아 얻은 보호가 회수 없는 경로로 새어 나가는 것이다.
      focusTrackingSeen 가드가 그 구멍을 막는다.
    */
    expect(eventsNamed(b, GRANT)).toHaveLength(0)
    expect(logs).toContain('[refreshLock] 승계 보류 — 대기 1 전원 비활성')
  })

  // ── 4행: setActive(x, true) / holder 비활성 ─────────────────────────────────
  it('활성 웹뷰가 새로 생겼는데 holder 가 비활성이면 회수하고 그 웹뷰에 승계한다', () => {
    const a = mount('wvA')
    const b = mount('wvB')

    lock.handleLockRequest('wvA', 'r1') // 활성 0 폴백 grant → holder 는 비활성
    lock.handleLockRequest('wvB', 'r2') // 큐

    lock.setActive('wvB', true)

    expect(eventsNamed(b, GRANT)).toEqual([{ name: GRANT, detail: { reqId: 'r2' } }])
    expect(eventNamesOf(a)).toEqual([GRANT])
    expect(logs).toContain('[refreshLock] holder 비활성 전환 (wvA) → 회수')
    expect(logs).toContain('[refreshLock] grant → wvB (활성 · 대기 0)')
  })

  it('활성 대기자가 하나도 없으면 승계를 보류한다', () => {
    const a = mount('wvA')
    const b = mount('wvB')
    mount('wvC')
    lock.setActive('wvA', true)
    lock.setActive('wvC', true)
    lock.handleLockRequest('wvA', 'r1')
    lock.handleLockRequest('wvB', 'r2') // 비활성 대기자

    lock.setActive('wvA', false) // C 가 아직 활성이라 회수는 일어난다

    expect(logs).toContain('[refreshLock] holder 비활성 전환 (wvA) → 회수')
    expect(logs).toContain('[refreshLock] 승계 보류 — 대기 1 전원 비활성')
    expect(eventsNamed(b, GRANT)).toHaveLength(0)
    expect(eventNamesOf(a)).toEqual([GRANT])
  })

  // ── 6행: token (회전 성공) ─────────────────────────────────────────────────
  it('token 수신 시 전 웹뷰에 방송하고 큐를 비우고 holder 를 해제한다 (holder 가 비활성이어도)', () => {
    const a = mount('wvA')
    const b = mount('wvB')
    const c = mount('wvC')

    lock.handleLockRequest('wvA', 'r1') // 활성 0 폴백 → 비활성 holder
    lock.handleLockRequest('wvB', 'r2') // 큐

    lock.handleTokenReceived('ACCESS_1')

    const broadcast = { name: BROADCAST, detail: { accessToken: 'ACCESS_1' } }
    expect(eventsNamed(a, BROADCAST)).toEqual([broadcast])
    expect(eventsNamed(b, BROADCAST)).toEqual([broadcast])
    expect(eventsNamed(c, BROADCAST)).toEqual([broadcast])
    expect(logs).toContain('[refreshLock] broadcast → 웹뷰 3 (해소된 대기 1)')

    // 큐가 비었으므로 B 는 승계 grant 를 받지 않고,
    // holder 가 풀렸으므로 다음 활성 요청자가 즉시 grant 된다.
    lock.setActive('wvC', true)
    expect(eventsNamed(b, GRANT)).toHaveLength(0)
    lock.handleLockRequest('wvC', 'r5')
    expect(eventsNamed(c, GRANT)).toEqual([{ name: GRANT, detail: { reqId: 'r5' } }])
  })

  // ── 7행: release (회전 실패) ───────────────────────────────────────────────
  it('holder 의 release 는 락을 풀고 활성 대기자에게 승계한다', () => {
    const a = mount('wvA')
    const b = mount('wvB')
    lock.setActive('wvA', true)
    lock.setActive('wvB', true)
    lock.handleLockRequest('wvA', 'r1')
    lock.handleLockRequest('wvB', 'r2')

    lock.handleLockRelease('r1')

    expect(eventsNamed(b, GRANT)).toEqual([{ name: GRANT, detail: { reqId: 'r2' } }])
    expect(eventNamesOf(a)).toEqual([GRANT])
    expect(logs).toContain('[refreshLock] release wvA → 승계 (대기 1)')
  })

  it('holder 아닌 release 는 무시하되 그 reqId 를 큐에서 제거한다', () => {
    const a = mount('wvA')
    const b = mount('wvB')
    lock.setActive('wvA', true)
    lock.handleLockRequest('wvA', 'r1') // grant
    lock.handleLockRequest('wvB', 'r2') // 큐 (비활성)

    lock.handleLockRelease('r2')

    expect(logs).toContain('[refreshLock] release 무시 (r2 · 현 holder 아님 · 큐 정리 1)')

    // 죽은 reqId 가 큐에 남아 있었다면 아래에서 B 에게 승계 grant 가 갔을 것이다.
    lock.setActive('wvB', true)
    lock.setActive('wvA', false)
    expect(eventsNamed(b, GRANT)).toHaveLength(0)
    expect(eventNamesOf(a)).toEqual([GRANT])
  })

  // ── 8행: holder 30s 타임아웃 ───────────────────────────────────────────────
  it('holder 가 30s 안에 끝내지 못하면 자동 해제하고 활성 대기자에게 승계한다', () => {
    const a = mount('wvA')
    const b = mount('wvB')
    lock.setActive('wvA', true)
    lock.setActive('wvB', true)
    lock.handleLockRequest('wvA', 'r1')
    lock.handleLockRequest('wvB', 'r2')

    jest.advanceTimersByTime(HOLDER_TIMEOUT_MS - 1)
    expect(eventsNamed(b, GRANT)).toHaveLength(0)

    jest.advanceTimersByTime(1)

    expect(logs).toContain('[refreshLock] holder timeout 30s (wvA) → 자동 해제')
    expect(eventsNamed(b, GRANT)).toEqual([{ name: GRANT, detail: { reqId: 'r2' } }])
    expect(eventNamesOf(a)).toEqual([GRANT])
  })

  it('release 로 락이 풀리면 그 holder 의 타임아웃 타이머도 함께 꺼진다', () => {
    mount('wvA')
    lock.setActive('wvA', true)
    lock.handleLockRequest('wvA', 'r1')

    lock.handleLockRelease('r1')
    jest.advanceTimersByTime(HOLDER_TIMEOUT_MS * 2)

    expect(logs).not.toContain('[refreshLock] holder timeout 30s (wvA) → 자동 해제')
  })

  // ── 9행: unregister(holder) ───────────────────────────────────────────────
  it('holder 가 unregister 되면 해제하고 승계한다', () => {
    const a = mount('wvA')
    const b = mount('wvB')
    lock.setActive('wvA', true)
    lock.setActive('wvB', true)
    lock.handleLockRequest('wvA', 'r1')
    lock.handleLockRequest('wvB', 'r2')

    lock.unregister('wvA')

    expect(eventsNamed(b, GRANT)).toEqual([{ name: GRANT, detail: { reqId: 'r2' } }])
    expect(eventNamesOf(a)).toEqual([GRANT]) // 떠난 웹뷰엔 아무것도 더 주입되지 않는다
    expect(logs).toContain('[refreshLock] unregister wvA — holder 였음 → 승계')
    expect(logs).toContain('[refreshLock] unregister wvA (총 1)')
  })

  /**
   * 🔴 폴백은 "focus 추적이 통째로 안 되는 환경" 전용이다 — "지금 아무것도 화면에 없는
   * 찰나" 가 아니다. 둘을 `activeWebviews.size === 0` 하나로 판정하면 blur→focus 전이
   * 구간이나 웹뷰 없는 화면에서 **얼어붙은 배경 웹뷰가 락을 받는다**(spec 도입 첫날 발견).
   * 그래서 판정 근거를 `focusTrackingSeen` 으로 옮겼다. 아래 두 테스트가 그 경계를 잠근다.
   */
  it('🔴 focus 를 한 번이라도 받은 앱이면, 활성 0 이어도 배경 웹뷰에 grant 하지 않는다', () => {
    mount('wvA')
    const b = mount('wvB')
    lock.setActive('wvA', true) // 추적이 살아 있음이 증명된 시점
    lock.unregister('wvA') // 활성 0 — 그러나 폴백을 열어서는 안 된다

    lock.handleLockRequest('wvB', 'r9')

    expect(eventsNamed(b, GRANT)).toHaveLength(0)
    expect(eventsNamed(b, QUEUED)).toEqual([{ name: QUEUED, detail: { reqId: 'r9' } }])
  })

  it('focus 보고를 한 번도 못 받은 앱에서는 폴백 선착순이 그대로 동작한다', () => {
    const b = mount('wvB') // setActive 를 아무도 부른 적 없다 (구버전·배선 실패 환경)

    lock.handleLockRequest('wvB', 'r9')

    expect(eventsNamed(b, GRANT)).toEqual([{ name: GRANT, detail: { reqId: 'r9' } }])
  })

  it('unregister 는 그 웹뷰의 대기 항목도 큐에서 지운다', () => {
    const a = mount('wvA')
    const b = mount('wvB')
    lock.setActive('wvA', true)
    lock.setActive('wvB', true)
    lock.handleLockRequest('wvA', 'r1')
    lock.handleLockRequest('wvB', 'r2')

    lock.unregister('wvB')
    lock.handleLockRelease('r1')

    expect(logs).toContain('[refreshLock] release wvA → 승계 (대기 0)')
    expect(eventsNamed(b, GRANT)).toHaveLength(0)
    expect(eventNamesOf(a)).toEqual([GRANT])
  })

  // ── 방어 경로 ─────────────────────────────────────────────────────────────
  describe('방어 경로', () => {
    it('등록되지 않은(로드 전) 웹뷰로의 주입은 조용히 건너뛴다', () => {
      const a = mount('wvA')
      lock.setActive('wvA', true)

      expect(() => lock.handleLockRequest('wvGhost', 'rX')).not.toThrow()

      expect(a.inject).not.toHaveBeenCalled()
      expect(logs).toContain('[refreshLock] queue wvGhost (비활성 · holder=없음 · 대기 1)')
    })

    it('모르는 reqId 의 release 는 무시한다', () => {
      mount('wvA')

      expect(() => lock.handleLockRelease('없는-reqId')).not.toThrow()

      expect(logs).toContain(
        '[refreshLock] release 무시 (없는-reqId · 현 holder 아님 · 큐 정리 0)',
      )
    })

    it('웹뷰가 하나도 없을 때의 token 방송은 아무 일도 하지 않는다', () => {
      expect(() => lock.handleTokenReceived('ACCESS_0')).not.toThrow()
      expect(logs).toContain('[refreshLock] broadcast → 웹뷰 0 (해소된 대기 0)')
    })

    it('같은 활성 상태 재보고는 재중재를 트리거하지 않는다', () => {
      const a = mount('wvA')
      lock.setActive('wvA', true)
      lock.setActive('wvA', true)

      expect(logs.filter((line) => line === '[refreshLock] active on wvA (활성 1)')).toHaveLength(1)
      expect(a.inject).not.toHaveBeenCalled()
    })
  })
})
