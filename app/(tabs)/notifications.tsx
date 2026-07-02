import { View, Text, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

/**
 * 알림 센터 — 인앱 백업 · push 히스토리.
 *
 * W2 shell · W3 에 실 데이터 API 연동.
 */
export default function NotificationsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>알림</Text>
      </View>
      <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>🔕</Text>
        <Text style={styles.emptyTitle}>알림이 없어요</Text>
        <Text style={styles.emptyDesc}>
          중요한 마감 · 시험 일정을 알려드릴게요.
        </Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#191b1c',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#191b1c',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#8a8f98',
    textAlign: 'center',
  },
})
