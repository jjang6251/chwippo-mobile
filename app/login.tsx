import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { AxiosError } from 'axios'
import { login as kakaoLogin } from '@react-native-kakao/user'
// Apple SIWA · UI 는 hide 상태이지만 함수 구현 유지 · Apple Developer 유료 후 button 복구
import * as AppleAuthentication from 'expo-apple-authentication'
import { useAuthStore } from '@/stores/authStore'
import { kakaoNativeLogin, appleNativeLogin } from '@/api/auth'

/**
 * 로그인 화면 · W3 실 SDK 연동.
 *
 *  - Kakao: @react-native-kakao/user
 *  - SIWA: expo-apple-authentication (iOS 만 노출)
 *
 * 두 버튼 equal weight (Apple Guideline 4.8).
 */

type LoadingKind = 'kakao' | 'apple' | null

interface UserCancelledLike {
  code?: string
  message?: string
}

function isUserCancelled(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const code = (err as UserCancelledLike).code
    const message = ((err as UserCancelledLike).message ?? '').toLowerCase()
    // Kakao: 'RNCKakaoUser' error code 시리즈 · Apple: ERR_REQUEST_CANCELED
    if (
      code === 'ERR_REQUEST_CANCELED' ||
      code === 'RNCKakaoUserCancelled' ||
      message.includes('cancel')
    ) {
      return true
    }
  }
  return false
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof AxiosError) {
    if (!err.response) return '네트워크 연결을 확인해주세요.'
    if (err.response.status === 403) {
      return '정지된 계정입니다. 문의는 support@chwippo.com 으로 부탁드립니다.'
    }
    if (err.response.status === 401) return '로그인 인증에 실패했습니다.'
    if (err.response.status >= 500)
      return '서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해주세요.'
    return '로그인에 실패했습니다. 잠시 후 다시 시도해주세요.'
  }
  return fallback
}

export default function LoginScreen() {
  const setSession = useAuthStore((s) => s.setSession)
  const router = useRouter()
  const [loading, setLoading] = useState<LoadingKind>(null)

  const handleKakaoLogin = async () => {
    if (loading) return
    setLoading('kakao')
    try {
      // 검증용 임시 · web 로그인 강제 (KakaoTalk 앱 계정 자동사용 우회)
      // 실 UX 는 kakaoLogin() 옵션 없이 · 검증 끝나면 revert
      const kakao = await kakaoLogin({ useKakaoAccountLogin: true })
      const result = await kakaoNativeLogin(kakao.accessToken)
      setSession(result.accessToken, result.user)
      router.replace('/(tabs)')
    } catch (err) {
      if (isUserCancelled(err)) return
      Alert.alert(
        '로그인 실패',
        extractErrorMessage(err, '알 수 없는 오류가 발생했습니다.'),
      )
    } finally {
      setLoading(null)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleAppleLogin = async () => {
    if (loading) return
    setLoading('apple')
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      })
      if (!credential.identityToken) {
        Alert.alert('Apple 로그인 실패', 'identity token 을 받지 못했습니다.')
        return
      }
      const fullName = credential.fullName
        ? {
            givenName: credential.fullName.givenName,
            familyName: credential.fullName.familyName,
          }
        : undefined
      const result = await appleNativeLogin(credential.identityToken, fullName)
      setSession(result.accessToken, result.user)
    } catch (err) {
      if (isUserCancelled(err)) return
      Alert.alert(
        'Apple 로그인 실패',
        extractErrorMessage(err, '알 수 없는 오류가 발생했습니다.'),
      )
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

        {/* Apple SIWA — Personal Team 미지원 · Apple Developer 유료 활성화 후 복구
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
        */}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          계속 진행하시면 <Text style={styles.link}>이용약관</Text>
          {' 및 '}
          <Text style={styles.link}>개인정보처리방침</Text>에 동의하는 것으로
          간주됩니다.
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
