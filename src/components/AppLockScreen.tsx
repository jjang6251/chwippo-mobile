import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeStore } from '@/stores/themeStore'
import { getPalette } from '@/theme/palette'

/**
 * ① 앱 잠금 화면 — 브랜드 톤 풀스크린 오버레이.
 *
 * 인증 성공 전까지 콘텐츠를 완전히 가림 (불투명 palette.bg).
 * AppLockGate 가 콜드스타트 / background 복귀 시 이 화면을 띄우고 생체 인증을 트리거.
 * 인증 실패·취소 시 이 화면이 유지되며 사용자가 "잠금 해제"로 재시도.
 */
interface Props {
  onUnlock: () => void
}

export function AppLockScreen({ onUnlock }: Props) {
  const theme = useThemeStore((s) => s.theme)
  const palette = getPalette(theme)

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <View style={styles.center}>
        <Image
          source={require('../../assets/icon.png')}
          style={styles.icon}
          accessibilityIgnoresInvertColors
        />
        <Text style={[styles.title, { color: palette.textPrimary }]}>
          치뽀가 잠겨 있어요
        </Text>
        <Text style={[styles.subtitle, { color: palette.textTertiary }]}>
          내 취업 준비 기록을 보호하고 있어요.
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Face ID로 잠금 해제"
        onPress={onUnlock}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: palette.brand },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="lock-open-outline" size={18} color={palette.bg} />
        <Text style={[styles.buttonText, { color: palette.bg }]}>
          Face ID로 잠금 해제
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    elevation: 999,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 56,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 18,
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    width: '100%',
    maxWidth: 360,
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
})
