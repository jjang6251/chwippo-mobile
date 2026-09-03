import { shouldHideTabBar, WEB_SIDEBAR_MIN_WIDTH } from './tabMeta'

/**
 * shouldHideTabBar — 「웹 사이드바가 실제로 보일 폭에서만 탭을 숨긴다」 (2026-09-03 정정).
 *
 * 시나리오:
 *   1. 폰(isPad=false)은 어떤 폭에서도 탭 유지 — Apple 4.2 방어의 본진
 *   2. iPad 세로 폭(768~834pt)은 사이드바가 안 뜨므로 탭 표시
 *   3. iPad 가로 폭(1024~1366pt)은 사이드바가 뜨므로 탭 숨김
 *   4. 경계 1023/1024 — 웹 Tailwind `lg:`(min-width:1024px)와 동일 판정
 *   5. iPad Split View(가로인데 좁음)도 폭 기준이라 탭 복귀
 */
describe('shouldHideTabBar', () => {
  it('폰은 어떤 폭에서도 탭을 숨기지 않는다', () => {
    expect(shouldHideTabBar(false, 390)).toBe(false)
    expect(shouldHideTabBar(false, 1024)).toBe(false)
    expect(shouldHideTabBar(false, 1366)).toBe(false)
  })

  it('iPad 세로 폭(사이드바 미노출)에서는 탭을 표시한다', () => {
    expect(shouldHideTabBar(true, 768)).toBe(false) // iPad mini · 9.7"
    expect(shouldHideTabBar(true, 810)).toBe(false) // iPad 10.2"
    expect(shouldHideTabBar(true, 834)).toBe(false) // iPad Air · 11"
  })

  it('iPad 가로 폭(사이드바 노출)에서는 탭을 숨긴다', () => {
    expect(shouldHideTabBar(true, 1024)).toBe(true) // 12.9" 세로 = 가장 좁은 노출 폭
    expect(shouldHideTabBar(true, 1194)).toBe(true) // 11" 가로
    expect(shouldHideTabBar(true, 1366)).toBe(true) // 12.9" 가로
  })

  it('경계는 웹 lg: 문턱과 동일하다 (1023 표시 · 1024 숨김)', () => {
    expect(shouldHideTabBar(true, WEB_SIDEBAR_MIN_WIDTH - 1)).toBe(false)
    expect(shouldHideTabBar(true, WEB_SIDEBAR_MIN_WIDTH)).toBe(true)
  })

  it('iPad Split View(좁은 창)에서는 탭이 복귀한다', () => {
    expect(shouldHideTabBar(true, 507)).toBe(false) // 11" 가로 절반
    expect(shouldHideTabBar(true, 678)).toBe(false) // 12.9" 가로 절반
  })
})
