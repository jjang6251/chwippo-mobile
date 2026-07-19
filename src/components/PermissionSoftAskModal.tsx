import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useThemeStore } from '@/stores/themeStore'
import { getPalette } from '@/theme/palette'

/**
 * soft-ask 모달 (⑦ 가치 순간) — 웹에서 마감일 저장 직후 노출.
 *
 * iOS OS 프롬프트는 평생 1회라, 커스텀 모달로 맥락을 먼저 설명해 승낙 확률을
 * 높이고 그 기회를 보호한다. '알림 받기' 승낙 시에만 실제 OS 권한을 요청한다.
 * 웹 PermissionPromptModal 과 동일한 톤 (다크/라이트 자동 · palette 미러).
 */
interface Props {
  visible: boolean
  onAllow: () => void
  onDismiss: () => void
}

export function PermissionSoftAskModal({ visible, onAllow, onDismiss }: Props) {
  const theme = useThemeStore((s) => s.theme)
  const palette = getPalette(theme)

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            { backgroundColor: palette.surface, borderColor: palette.line },
          ]}
        >
          <Text style={styles.emoji}>🔔</Text>
          <Text style={[styles.title, { color: palette.textPrimary }]}>
            이 마감, 놓치지 않게 알려드릴까요?
          </Text>
          <Text style={[styles.body, { color: palette.textTertiary }]}>
            마감·면접이 다가오면 앱을 열지 않아도 아침에 챙겨드려요. 밤 10시~아침
            8시엔 보내지 않아요.
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="알림 받기"
            style={[styles.allowBtn, { backgroundColor: palette.brand }]}
            onPress={onAllow}
          >
            <Text style={[styles.allowText, { color: palette.bg }]}>
              알림 받기
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="나중에"
            style={styles.laterBtn}
            onPress={onDismiss}
          >
            <Text style={[styles.laterText, { color: palette.textTertiary }]}>
              나중에
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 34,
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  allowBtn: {
    width: '100%',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  allowText: {
    fontSize: 15,
    fontWeight: '700',
  },
  laterBtn: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  laterText: {
    fontSize: 14,
    fontWeight: '500',
  },
})
