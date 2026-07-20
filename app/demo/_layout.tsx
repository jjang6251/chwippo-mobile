import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeStore } from '@/stores/themeStore'
import { getPalette } from '@/theme/palette'
import { TAB_META, TAB_ICON_SIZE, makeTabBarOptions } from '@/navigation/tabMeta'

/**
 * 데모(둘러보기) 하단 탭 — 실서비스 (tabs) 를 미러. 탭 정의는 @/navigation/tabMeta 공유.
 *
 * 실서비스와 다른 점:
 *   - 비로그인 공개 · 그룹(`(demo-tabs)`)이 아닌 일반 중첩 라우트(app/demo/)라 네이티브
 *     경로가 `/demo/*` → 실서비스 `(tabs)`(`/board` 등)와 URL 충돌 없음.
 *   - NativeHeader 미노출: 알림 벨은 로그인 전용이고 데모에서 누르면 웹뷰가 /notifications →
 *     AuthGuard 로 이탈해버림. 상단 안전영역은 각 탭 AppWebView(demo=true)가 처리하고,
 *     "둘러보는 중" 안내·둘러보기 종료·가입 유도는 웹 DemoBanner 가 담당.
 */

export default function DemoTabsLayout() {
  const theme = useThemeStore((s) => s.theme)
  const palette = getPalette(theme)

  return (
    <Tabs
      initialRouteName="index"
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        ...makeTabBarOptions(palette),
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
