import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeStore } from '@/stores/themeStore'
import { getPalette } from '@/theme/palette'

/**
 * ② 오프라인 화면 — 브랜드 톤 풀스크린 오버레이.
 *
 * WebView 위에 덮어 Safari 흰 에러 화면 노출을 막음 (Apple 4.2 방어).
 * 네트워크 미연결 감지 또는 WebView onError(네트워크 계열) 시 표시.
 * 연결 복구 시 자동으로 사라지고 WebView 가 reload 됨 (AppWebView 에서 처리).
 */
interface Props {
  onRetry: () => void
}

export function OfflineScreen({ onRetry }: Props) {
  const theme = useThemeStore((s) => s.theme)
  const palette = getPalette(theme)

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <View
        style={[styles.iconWrap, { backgroundColor: palette.surface }]}
      >
        <Ionicons name="cloud-offline-outline" size={34} color={palette.brand} />
      </View>
      <Text style={[styles.title, { color: palette.textPrimary }]}>
        인터넷 연결이 없어요
      </Text>
      <Text style={[styles.subtitle, { color: palette.textTertiary }]}>
        와이파이나 데이터 연결을 확인한 뒤 다시 시도해주세요.
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="다시 시도"
        onPress={onRetry}
        style={({ pressed }) => [
          styles.button,
          { borderColor: palette.line },
          pressed && { backgroundColor: palette.pressed },
        ]}
      >
        <Ionicons name="refresh-outline" size={16} color={palette.textPrimary} />
        <Text style={[styles.buttonText, { color: palette.textPrimary }]}>
          다시 시도
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 500,
    elevation: 500,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
})
