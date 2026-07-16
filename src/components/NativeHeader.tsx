import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useThemeStore } from '@/stores/themeStore'
import { getPalette } from '@/theme/palette'
import { useAuthStore } from '@/stores/authStore'
import { useNotificationBadge } from '@/hooks/useNotificationBadge'
import { useWebNavStore } from '@/stores/webNavStore'

/**
 * 네이티브 상단 헤더 — 5탭 공통 (Tabs `header` 옵션으로 각 탭 상단에 노출).
 *
 * 얇게(44pt) · 배경 palette.bg · 무거운 보더 없음 · 다크/라이트 자동.
 * 좌: "치뽀" 워드마크(brand) · 우: 종 아이콘 + 안읽음 배지(99+ cap · brand 원형).
 * 종 탭 → 현재 focus 된 WebView 를 /notifications 로 이동 (webNavStore 브릿지).
 */
export function NativeHeader() {
  const insets = useSafeAreaInsets()
  const theme = useThemeStore((s) => s.theme)
  const palette = getPalette(theme)
  const token = useAuthStore((s) => s.token)
  const unread = useNotificationBadge()

  const showBadge = !!token && unread > 0
  const badgeText = unread > 99 ? '99+' : String(unread)

  return (
    <View style={{ paddingTop: insets.top, backgroundColor: palette.bg }}>
      <View style={styles.bar}>
        <Text style={[styles.wordmark, { color: palette.brand }]}>치뽀</Text>
        <Pressable
          onPress={() =>
            useWebNavStore.getState().requestNavigate('/notifications')
          }
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={showBadge ? `알림 ${unread}개` : '알림'}
          style={styles.bell}
        >
          <Ionicons
            name="notifications-outline"
            size={22}
            color={palette.textTertiary}
          />
          {showBadge && (
            <View style={[styles.badge, { backgroundColor: palette.brand }]}>
              <Text style={styles.badgeText}>{badgeText}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  wordmark: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  bell: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
  },
})
