import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

/**
 * 홈 화면 — 네이티브 D-day list.
 *
 * Apple 4.2 방어 핵심:
 *  - 이 화면은 반드시 native RN (WebView X)
 *  - iOS 위젯 source 데이터 (W4 App Group 공유)
 *
 * W2 shell 단계 · 실 API 연동은 W3 · 위젯 source 는 W4.
 */
export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.greeting}>안녕하세요</Text>
        <Text style={styles.subtitle}>임박한 마감</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyTitle}>아직 등록된 일정이 없어요</Text>
          <Text style={styles.emptyDesc}>
            지원한 회사와 마감일을 등록하면{'\n'}
            이 곳에 D-day 카드가 표시됩니다.
          </Text>
        </View>
      </ScrollView>
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
    paddingTop: 16,
    paddingBottom: 20,
  },
  greeting: {
    fontSize: 13,
    color: '#8a8f98',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#191b1c',
  },
  scrollContent: {
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 80,
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
    lineHeight: 20,
  },
})
