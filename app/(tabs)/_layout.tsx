import { Tabs } from 'expo-router'
import { StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeStore } from '@/stores/themeStore'
import { getPalette } from '@/theme/palette'

/**
 * Native Tab bar — Apple 4.2 방어 필수 (웹 네비 절대 노출 X).
 *
 * W4 · 5 tabs (웹 MobileNav 매핑):
 *   캘린더 · 보드 · 회고 · 내정보 · 설정
 *
 * 다크 톤 + 웹 MobileNav 일관 · palette 는 웹 postMessage 브릿지로 sync.
 * Ionicons `-outline` 계열 · 웹 SVG stroke 아이콘 톤 매칭.
 */

const ICON_SIZE = 22

export default function TabsLayout() {
  const theme = useThemeStore((s) => s.theme)
  const palette = getPalette(theme)

  const styles = StyleSheet.create({
    tabBar: {
      backgroundColor: palette.surface,
      borderTopWidth: 1,
      borderTopColor: palette.line,
    },
    tabLabel: {
      fontSize: 10,
      fontWeight: '500',
    },
  })

  return (
    <Tabs
      initialRouteName="index"
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.brand,
        tabBarInactiveTintColor: palette.textQuaternary,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '캘린더',
          tabBarIcon: ({ color }) => (
            <Ionicons name="calendar-outline" size={ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="board"
        options={{
          title: '보드',
          tabBarIcon: ({ color }) => (
            <Ionicons name="list-outline" size={ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="growth"
        options={{
          title: '회고',
          tabBarIcon: ({ color }) => (
            <Ionicons name="grid-outline" size={ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="myinfo"
        options={{
          title: '내정보',
          tabBarIcon: ({ color }) => (
            <Ionicons name="folder-outline" size={ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarIcon: ({ color }) => (
            <Ionicons name="settings-outline" size={ICON_SIZE} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
