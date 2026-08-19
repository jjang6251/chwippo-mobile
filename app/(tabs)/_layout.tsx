import { Platform, type PlatformIOSStatic } from 'react-native'
import { Tabs } from 'expo-router'

import { Ionicons } from '@expo/vector-icons'
import { useThemeStore } from '@/stores/themeStore'
import { getPalette } from '@/theme/palette'
import { NativeHeader } from '@/components/NativeHeader'
import { TAB_META, TAB_ICON_SIZE, makeTabBarOptions, shouldHideTabBar } from '@/navigation/tabMeta'

/**
 * Native Tab bar — Apple 4.2 방어 필수 (웹 네비 절대 노출 X).
 *
 * W4 · 5 tabs (웹 MobileNav 매핑):
 *   캘린더 · 보드 · 회고 · 내정보 · 설정
 *
 * 탭 정의(name·title·아이콘·순서)는 @/navigation/tabMeta 로 데모 탭(app/demo/)과 공유.
 * 다크 톤 + 웹 MobileNav 일관 · palette 는 웹 postMessage 브릿지로 sync.
 * Ionicons `-outline` 계열 · 웹 SVG stroke 아이콘 톤 매칭.
 */

export default function TabsLayout() {
  const theme = useThemeStore((s) => s.theme)
  const palette = getPalette(theme)
  const isPad = Platform.OS === 'ios' && (Platform as PlatformIOSStatic).isPad === true

  return (
    <Tabs
      initialRouteName="index"
      backBehavior="initialRoute"
      screenOptions={{
        // iPad = 웹 사이드바가 주 네비 — 하단 탭 + 네이티브 헤더 둘 다 숨김.
        // 헤더만 남기면 웹 사이드바(브랜드·알림 종)와 이중 헤더가 된다 (2026-08-19 iPad 실기).
        // 헤더가 담당하던 상단 safe-area 는 AppWebView 가 isPad 에서 edges=['top'] 으로 넘겨받는다.
        ...(isPad
          ? { headerShown: false }
          : { headerShown: true, header: () => <NativeHeader /> }),
        ...makeTabBarOptions(palette),
        // (tabMeta.shouldHideTabBar 주석 참조 — 4.2 리스크 수용 기록)
        ...(shouldHideTabBar(isPad) ? { tabBarStyle: { display: 'none' as const } } : {}),
      }}
    >
      {TAB_META.map(({ name, title, icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color }) => (
              <Ionicons name={icon} size={TAB_ICON_SIZE} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  )
}
