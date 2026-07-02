import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'

/**
 * 설정 화면 — Face ID · 알림 · 로그아웃 · **계정 삭제** (Guideline 5.1.1(v)).
 *
 * W2 shell:
 *  - 로그아웃: 동작 (JWT 삭제)
 *  - 계정 삭제: UI 만 · W3 백엔드 endpoint 연동 후 실 동작
 *  - Face ID · 알림: UI placeholder · W3 구현
 */
export default function SettingsScreen() {
  const router = useRouter()
  const clearAll = useAuthStore((s) => s.clearAll)

  const handleLogout = () => {
    Alert.alert('로그아웃', '정말 로그아웃하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          await clearAll()
          router.replace('/login')
        },
      },
    ])
  }

  const handleDeleteAccount = () => {
    Alert.alert('회원 탈퇴', 'W3 에서 백엔드 endpoint 연동 예정입니다.', [{ text: '확인' }])
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>설정</Text>
      </View>

      <ScrollView>
        <Section title="보안">
          <Row label="Face ID / Touch ID 앱 잠금" hint="W3 구현 예정" />
        </Section>

        <Section title="알림">
          <Row label="푸시 알림" hint="W3 구현 예정" />
        </Section>

        <Section title="계정">
          <Row label="로그아웃" onPress={handleLogout} />
          <Row label="회원 탈퇴" onPress={handleDeleteAccount} danger />
        </Section>

        <Section title="정보">
          <Row label="이용약관" hint="chwippo.com/terms" />
          <Row label="개인정보처리방침" hint="chwippo.com/privacy" />
          <Row label="버전" hint="0.1.0 (W2 shell)" />
        </Section>
      </ScrollView>
    </SafeAreaView>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  )
}

function Row({
  label,
  hint,
  danger,
  onPress,
}: {
  label: string
  hint?: string
  danger?: boolean
  onPress?: () => void
}) {
  const Container = onPress ? Pressable : View
  return (
    <Container
      onPress={onPress}
      style={({ pressed }: { pressed?: boolean }) => [
        styles.row,
        pressed && onPress && { backgroundColor: '#f5f6f7' },
      ]}
    >
      <Text style={[styles.rowLabel, danger && styles.rowDanger]}>{label}</Text>
      {hint && <Text style={styles.rowHint}>{hint}</Text>}
    </Container>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f6f7',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#191b1c',
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8a8f98',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionBody: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
  },
  row: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f1f2',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: {
    fontSize: 15,
    color: '#191b1c',
  },
  rowDanger: {
    color: '#dc2626',
  },
  rowHint: {
    fontSize: 13,
    color: '#8a8f98',
  },
})
