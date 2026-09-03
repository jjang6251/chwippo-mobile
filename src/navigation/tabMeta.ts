import type { ComponentProps } from 'react'
import { Ionicons } from '@expo/vector-icons'
import type { Palette } from '@/theme/palette'

type IoniconName = ComponentProps<typeof Ionicons>['name']

export interface TabMeta {
  /** expo-router route 파일명 (index/board/growth/myinfo/settings) */
  name: string
  title: string
  icon: IoniconName
}

/**
 * 네이티브 하단 탭 정의.
 *
 * 🔴 2026-08-19 실서비스/데모 **분리** — 원래 한 배열을 공유했는데, 탭 스왑(내정보 → 공부
 * 노트, CEO 결정 2026-08-18)이 **실서비스에만** 해당한다: 웹 데모엔 공부 노트 라우트·샘플
 * 데이터가 없어 데모는 기존 5탭(내정보 포함)을 유지한다 (웹 MobileNav 와 같은 판정).
 * 공유를 유지한 채 스왑하면 데모 탭이 /demo/study-notes(비존재 → 캘린더로 튕김)를 가리킨다.
 *
 * 소비처:
 *   - app/(tabs)/_layout.tsx    (실서비스 · TAB_META)
 *   - app/demo/_layout.tsx      (데모 · DEMO_TAB_META)
 */
export const TAB_META: readonly TabMeta[] = [
  { name: 'index', title: '캘린더', icon: 'calendar-outline' },
  { name: 'board', title: '보드', icon: 'list-outline' },
  { name: 'growth', title: '회고', icon: 'grid-outline' },
  // 내정보 자리 → 공부 노트 (탭은 "매일 여는 습관 표면" 기준 — 내정보는 /myinfo 웹 CTA 로 진입)
  { name: 'study-notes', title: '공부 노트', icon: 'book-outline' },
  { name: 'settings', title: '설정', icon: 'settings-outline' },
]

/** 데모 전용 — 기존 5탭 불변 (공부 노트 데모 라우트가 생기면 TAB_META 로 재통합) */
export const DEMO_TAB_META: readonly TabMeta[] = [
  { name: 'index', title: '캘린더', icon: 'calendar-outline' },
  { name: 'board', title: '보드', icon: 'list-outline' },
  { name: 'growth', title: '회고', icon: 'grid-outline' },
  { name: 'myinfo', title: '내정보', icon: 'folder-outline' },
  { name: 'settings', title: '설정', icon: 'settings-outline' },
]

/** 탭바 아이콘 크기 — 양 레이아웃 공통 */
export const TAB_ICON_SIZE = 22

/**
 * 웹 사이드바(chwippo-front Sidebar)가 노출되는 최소 폭 — Tailwind `lg:` 문턱과 짝.
 * 웹이 이 값을 바꾸면 여기도 같이 바뀌어야 한다 (Sidebar.tsx `hidden lg:flex`).
 */
export const WEB_SIDEBAR_MIN_WIDTH = 1024

/**
 * 🔴 iPad 는 하단 탭을 숨긴다 (CEO 결정 2026-08-19) — 웹 사이드바(접이식 레일, ADR-075)가
 * 주 네비가 된다. iPad 폭(≥1024px)에선 웹뷰 안 사이드바가 어차피 떠서, 탭을 유지하면
 * **이중 네비**가 된다 (supportsTablet 전환에서 발견).
 *
 * 🔧 2026-09-03 정정 — 「iPad 폭 ≥1024」 전제는 **가로에서만** 참이다. 세로(768~834pt)와
 * Split View 에선 웹 사이드바(`lg:` = 1024px)가 안 떠서 네비가 전무해졌다 (iPad 세로 실기).
 * 그래서 판정을 기기(isPad)가 아니라 **현재 창 폭**으로 바꾼다: 사이드바가 실제로 보일
 * 폭에서만 탭을 숨긴다. 회전·Split View 로 폭이 줄면 탭이 복귀한다.
 *
 * ⚠️ 리스크 수용 기록: 하단 탭은 Apple 4.2(웹 클리퍼 리젝) 방어 장치였다. iPad 에서
 * 웹 사이드바만 남기는 것은 그 원칙의 예외이며 CEO 가 리스크를 알고 결정했다 —
 * 방어는 iPhone 탭바·네이티브 헤더·알림·공유 확장이 계속 담당한다.
 * (Platform.isPad 는 iOS 전용 — Android 태블릿은 vc20 때 별도 판정)
 */
export function shouldHideTabBar(isPad: boolean, windowWidth: number): boolean {
  return isPad && windowWidth >= WEB_SIDEBAR_MIN_WIDTH
}

/**
 * 탭바 공통 스타일 옵션 — 실서비스 `(tabs)`·데모 `demo/` 가 공유 (스타일 이중화 방지).
 * headerShown·header 는 레이아웃별 결정(실서비스=NativeHeader · 데모=미노출)이라 여기 안 둠.
 */
export function makeTabBarOptions(palette: Palette) {
  return {
    tabBarActiveTintColor: palette.brand,
    tabBarInactiveTintColor: palette.textQuaternary,
    tabBarStyle: {
      backgroundColor: palette.surface,
      borderTopWidth: 1,
      borderTopColor: palette.line,
    },
    tabBarLabelStyle: { fontSize: 10, fontWeight: '500' as const },
  }
}
