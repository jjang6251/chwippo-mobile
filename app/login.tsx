import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'

/**
 * 로그인 화면 — Kakao + Sign in with Apple 병행 (Apple Guideline 4.8).
 *
 * W2 shell 단계 · UI 만 구현 · 실 SDK 연동은 W3.
 *  - Kakao: @react-native-kakao/user (prebuild 후 동작)
 *  - SIWA: expo-apple-authentication (iOS 실기 or Simulator)
 *
 * 두 버튼 equal weight (Apple 심사 요구 사항).
 * iOS 만 SIWA 노출 · Android 는 Kakao 만.
 */

export default function LoginScreen() {
  const router = useRouter()
  const setToken = useAuthStore((s) => s.setToken)
  const [loading, setLoading] = useState<'kakao' | 'apple' | null>(null)

  const handleKakaoLogin = async () => {
    setLoading('kakao')
    try {
      // TODO(W3): Kakao SDK login() → accessToken → POST /auth/kakao/native → JWT
      await new Promise((resolve) => setTimeout(resolve, 500))
      Alert.alert('Kakao 로그인', 'W3 에서 실 SDK 연동 예정')
      // Mock: 임시 JWT 설정 → 홈 진입
      setToken('mock-jwt-kakao')
      router.replace('/(tabs)')
    } catch (error) {
      Alert.alert('로그인 실패', String(error))
    } finally {
      setLoading(null)
    }
  }

  const handleAppleLogin = async () => {
    setLoading('apple')
    try {
      // TODO(W3): expo-apple-authentication signInAsync → identityToken → POST /auth/apple/native → JWT
      await new Promise((resolve) => setTimeout(resolve, 500))
      Alert.alert('Apple 로그인', 'W3 에서 실 SDK 연동 예정')
      setToken('mock-jwt-apple')
      router.replace('/(tabs)')
    } catch (error) {
      Alert.alert('로그인 실패', String(error))
    } finally {
      setLoading(null)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.brandArea}>
        <Text style={styles.logo}>치뽀</Text>
        <Text style={styles.tagline}>취업 준비 · 모든 일정을 한 곳에</Text>
      </View>

      <View style={styles.buttonArea}>
        {/* Kakao 버튼 */}
        <Pressable
          onPress={handleKakaoLogin}
          disabled={loading !== null}
          style={({ pressed }) => [
            styles.button,
            styles.kakaoButton,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="카카오로 로그인"
        >
          {loading === 'kakao' ? (
            <ActivityIndicator color="#191919" />
          ) : (
            <Text style={styles.kakaoText}>카카오로 로그인</Text>
          )}
        </Pressable>

        {/* Apple 버튼 — iOS 만 */}
        {Platform.OS === 'ios' && (
          <Pressable
            onPress={handleAppleLogin}
            disabled={loading !== null}
            style={({ pressed }) => [
              styles.button,
              styles.appleButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Apple로 로그인"
          >
            {loading === 'apple' ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.appleText}> Apple로 로그인</Text>
            )}
          </Pressable>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          계속 진행하시면{' '}
          <Text style={styles.link}>이용약관</Text>
          {' 및 '}
          <Text style={styles.link}>개인정보처리방침</Text>
          에 동의하는 것으로 간주됩니다.
        </Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  brandArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },
  logo: {
    fontSize: 48,
    fontWeight: '800',
    color: '#6b9c7f',
    marginBottom: 12,
  },
  tagline: {
    fontSize: 15,
    color: '#8a8f98',
  },
  buttonArea: {
    gap: 10,
  },
  button: {
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kakaoButton: {
    backgroundColor: '#fee500',
  },
  kakaoText: {
    color: '#191919',
    fontSize: 16,
    fontWeight: '600',
  },
  appleButton: {
    backgroundColor: '#000000',
  },
  appleText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
  footer: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  footerText: {
    fontSize: 12,
    color: '#8a8f98',
    textAlign: 'center',
    lineHeight: 18,
  },
  link: {
    textDecorationLine: 'underline',
  },
})
