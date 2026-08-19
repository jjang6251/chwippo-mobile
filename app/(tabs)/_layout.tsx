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

  return (
    <Tabs
      initialRouteName="index"
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: true,
        header: () => <NativeHeader />,
        ...makeTabBarOptions(palette),
        // iPad = 웹 사이드바가 주 네비 — 하단 탭 숨김 (tabMeta.shouldHideTabBar 주석 참조)
        ...(shouldHideTabBar(Platform.OS === 'ios' && (Platform as PlatformIOSStatic).isPad === true)
          ? { tabBarStyle: { display: 'none' as const } }
          : {}),
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
