import { Tabs } from 'expo-router'
import { Text, StyleSheet } from 'react-native'

/**
 * Native Tab bar — Apple 4.2 방어 필수 (웹 네비 절대 노출 X).
 *
 * 4 tabs: 홈 · 알림 · 프로필 · 설정
 * 심사관 첫 인상 = 이 tab bar 가 native 로 보여야 함.
 *
 * W2 shell 단계 · icon 은 emoji placeholder · W4 에 native icon 교체.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#6b9c7f',
        tabBarInactiveTintColor: '#8a8f98',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🏠</Text>,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: '알림',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🔔</Text>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚙️</Text>,
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
})
