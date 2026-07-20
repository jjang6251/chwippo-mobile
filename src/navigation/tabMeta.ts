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
 * 네이티브 하단 탭 정의 — 실서비스 `(tabs)` 와 데모 `demo/` 탭이 공유하는 단일 소스.
 * 실서비스 탭(순서·타이틀·아이콘)을 바꾸면 데모 탭이 자동으로 따라간다(이중 정의 방지).
 *
 * 소비처:
 *   - app/(tabs)/_layout.tsx    (실서비스 · NativeHeader + 알림)
 *   - app/demo/_layout.tsx      (데모 · 헤더 없음 · 웹뷰 = /demo/*)
 */
export const TAB_META: readonly TabMeta[] = [
  { name: 'index', title: '캘린더', icon: 'calendar-outline' },
  { name: 'board', title: '보드', icon: 'list-outline' },
  { name: 'growth', title: '회고', icon: 'grid-outline' },
  { name: 'myinfo', title: '내정보', icon: 'folder-outline' },
  { name: 'settings', title: '설정', icon: 'settings-outline' },
]

/** 탭바 아이콘 크기 — 양 레이아웃 공통 */
export const TAB_ICON_SIZE = 22

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
