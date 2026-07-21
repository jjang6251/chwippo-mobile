import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import { AxiosError } from 'axios'
import { login as kakaoLogin } from '@react-native-kakao/user'
import * as AppleAuthentication from 'expo-apple-authentication'
import * as WebBrowser from 'expo-web-browser'
import Constants from 'expo-constants'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { getPalette } from '@/theme/palette'
import { kakaoNativeLogin, appleNativeLogin, reviewerLogin } from '@/api/auth'

/**
 * App Review(Guideline 2.1) 리뷰어 로그인 게이트 플래그 — 빌드 타임 상수.
 * EXPO_PUBLIC_REVIEWER_MODE 는 Expo 가 빌드 시 인라인 (eas.json production env 로 제어).
 * 평소 빌드엔 미설정 → 로고 7탭 제스처 완전 무반응(일반 사용자 노출 0). 심사 제출용 빌드에서만 '1'.
 */
const REVIEWER_MODE = process.env.EXPO_PUBLIC_REVIEWER_MODE === '1'

/**
 * 로그인 화면 · Kakao 원탭 + (미래 Apple SIWA).
 *
 * 다크/라이트 palette 매칭 · 웹 톤 일관.
 * Toss 톤 · brand 강조 · feature bullet 안내.
 */

type LoadingKind = 'kakao' | 'apple' | 'reviewer' | null

interface UserCancelledLike {
  code?: string
  message?: string
}

function isUserCancelled(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const code = (err as UserCancelledLike).code
    const message = ((err as UserCancelledLike).message ?? '').toLowerCase()
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

const WEB_URL =
  (Constants.expoConfig?.extra?.webUrl as string | undefined) ??
  'https://chwippo.com'

const FEATURES = [
  { icon: 'calendar-outline', text: '마감 · 면접 · 시험을 한눈에' },
  { icon: 'list-outline', text: '회사별 지원 카드로 진행 상황 관리' },
  { icon: 'trending-up-outline', text: '성장 지표로 회고까지' },
] as const

export default function LoginScreen() {
  const setSession = useAuthStore((s) => s.setSession)
  const theme = useThemeStore((s) => s.theme)
  const palette = getPalette(theme)
  const router = useRouter()
  const [loading, setLoading] = useState<LoadingKind>(null)

  // App Review 리뷰어 로그인 (숨김 · REVIEWER_MODE 빌드에서만)
  const [reviewerOpen, setReviewerOpen] = useState(false)
  const [reviewerEmail, setReviewerEmail] = useState('')
  const [reviewerPassword, setReviewerPassword] = useState('')

  // 로고 7탭 숨김 제스처 — 심사관 전용 리뷰어 로그인 진입 (일반 사용자 노출 0)
  const logoTapCount = useRef(0)
  const logoTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearLogoTapTimer = () => {
    if (logoTapTimer.current) {
      clearTimeout(logoTapTimer.current)
      logoTapTimer.current = null
    }
  }

  // 마지막 탭에서 2초 지나면 카운터 리셋 (우발 누적 방지)
  const handleLogoTap = () => {
    // 플래그 OFF 빌드에선 제스처 완전 무반응 (카운터 자체 미동작)
    if (!REVIEWER_MODE) return
    logoTapCount.current += 1
    clearLogoTapTimer()
    if (logoTapCount.current >= 7) {
      logoTapCount.current = 0
      setReviewerOpen(true)
      return
    }
    logoTapTimer.current = setTimeout(() => {
      logoTapCount.current = 0
      logoTapTimer.current = null
    }, 2000)
  }

  useEffect(() => clearLogoTapTimer, [])

  const openInAppBrowser = (path: string) => {
    void WebBrowser.openBrowserAsync(`${WEB_URL}${path}`).catch(() => {})
  }

  const handleKakaoLogin = async () => {
    if (loading) return
    setLoading('kakao')
    try {
      const kakao = await kakaoLogin()
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
      const result = await appleNativeLogin(
        credential.identityToken,
        fullName,
        credential.authorizationCode,
      )
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

  const handleReviewerLogin = async () => {
    if (loading) return
    const email = reviewerEmail.trim()
    if (!email || !reviewerPassword) return
    setLoading('reviewer')
    try {
      const result = await reviewerLogin(email, reviewerPassword)
      setSession(result.accessToken, result.user)
      setReviewerOpen(false)
      setReviewerPassword('')
      router.replace('/(tabs)')
    } catch (err) {
      Alert.alert(
        '로그인 실패',
        extractErrorMessage(err, '알 수 없는 오류가 발생했습니다.'),
      )
    } finally {
      setLoading(null)
    }
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: palette.bg }]}
    >
      <View style={styles.brandArea}>
        {/* 숨김 제스처: 7연속 탭 → 리뷰어 로그인. 장식 요소 유지 — accessibilityRole 없음(스크린리더에 버튼 미노출) · suppressHighlighting 으로 시각 변화 0 */}
        <Text
          style={[styles.logo, { color: palette.brand }]}
          onPress={handleLogoTap}
          suppressHighlighting
        >
          치뽀
        </Text>
        <Text style={[styles.tagline, { color: palette.textTertiary }]}>
          취업 준비, 이젠 흩어지지 않게
        </Text>
      </View>

      <View style={styles.featureArea}>
        {FEATURES.map((f) => (
          <View key={f.icon} style={styles.featureRow}>
            <View
              style={[
                styles.featureIcon,
                { backgroundColor: palette.surface },
              ]}
            >
              <Ionicons name={f.icon} size={18} color={palette.brand} />
            </View>
            <Text style={[styles.featureText, { color: palette.textPrimary }]}>
              {f.text}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.bottomArea}>
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
              <>
                <View style={styles.kakaoIconWrap}>
                  <Ionicons name="chatbubble" size={16} color="#191919" />
                </View>
                <Text style={styles.kakaoText}>카카오로 3초만에 시작하기</Text>
              </>
            )}
          </Pressable>

          {Platform.OS === 'ios' && (
            <View
              pointerEvents={loading !== null ? 'none' : 'auto'}
              style={loading === 'apple' && styles.appleLoading}
            >
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={
                  AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                }
                buttonStyle={
                  theme === 'light'
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                    : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                }
                cornerRadius={12}
                onPress={handleAppleLogin}
                style={styles.appleButton}
              />
            </View>
          )}
        </View>

        {/* 로그인 없이 둘러보기 — 데모 탭 그룹(app/demo/ · 실서비스 미러) 진입 */}
        <Pressable
          onPress={() => router.push('/demo')}
          disabled={loading !== null}
          style={({ pressed }) => [styles.demoButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="로그인 없이 둘러보기"
        >
          <Text style={[styles.demoText, { color: palette.textTertiary }]}>
            로그인 없이 둘러보기
          </Text>
        </Pressable>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: palette.textTertiary }]}>
            로그인 시{' '}
            <Text
              onPress={() => openInAppBrowser('/terms')}
              style={[styles.link, { color: palette.textPrimary }]}
            >
              이용약관
            </Text>
            {' · '}
            <Text
              onPress={() => openInAppBrowser('/privacy')}
              style={[styles.link, { color: palette.textPrimary }]}
            >
              개인정보처리방침
            </Text>
            에 동의합니다
          </Text>
        </View>
      </View>

      {/* 리뷰어 로그인 폼 (숨김 · 심사관 우회) */}
      <Modal
        visible={reviewerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReviewerOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: palette.surface }]}>
            <Text style={[styles.modalTitle, { color: palette.textPrimary }]}>
              리뷰어 로그인
            </Text>
            <Text
              style={[styles.modalHint, { color: palette.textTertiary }]}
            >
              App Review 계정으로 로그인하세요.
            </Text>

            <TextInput
              value={reviewerEmail}
              onChangeText={setReviewerEmail}
              placeholder="이메일"
              placeholderTextColor={palette.textQuaternary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              editable={loading === null}
              accessibilityLabel="리뷰어 이메일"
              style={[
                styles.input,
                { color: palette.textPrimary, borderColor: palette.line },
              ]}
            />
            <TextInput
              value={reviewerPassword}
              onChangeText={setReviewerPassword}
              placeholder="비밀번호"
              placeholderTextColor={palette.textQuaternary}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              textContentType="password"
              editable={loading === null}
              onSubmitEditing={handleReviewerLogin}
              returnKeyType="go"
              accessibilityLabel="리뷰어 비밀번호"
              style={[
                styles.input,
                { color: palette.textPrimary, borderColor: palette.line },
              ]}
            />

            <Pressable
              onPress={handleReviewerLogin}
              disabled={
                loading !== null ||
                !reviewerEmail.trim() ||
                !reviewerPassword
              }
              style={({ pressed }) => [
                styles.modalSubmit,
                { backgroundColor: palette.brand },
                (loading !== null ||
                  !reviewerEmail.trim() ||
                  !reviewerPassword) &&
                  styles.modalSubmitDisabled,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="리뷰어 로그인 제출"
            >
              {loading === 'reviewer' ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.modalSubmitText}>로그인</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => setReviewerOpen(false)}
              disabled={loading !== null}
              style={({ pressed }) => [
                styles.modalCancel,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="닫기"
            >
              <Text
                style={[styles.modalCancelText, { color: palette.textTertiary }]}
              >
                닫기
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  brandArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 44,
    fontWeight: '800',
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '500',
  },
  featureArea: {
    gap: 12,
    marginBottom: 32,
    paddingHorizontal: 4,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  bottomArea: {
    gap: 16,
  },
  buttonArea: {
    gap: 10,
  },
  button: {
    height: 54,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  kakaoButton: {
    backgroundColor: '#fee500',
  },
  kakaoIconWrap: {
    marginRight: 2,
  },
  kakaoText: {
    color: '#191919',
    fontSize: 15,
    fontWeight: '700',
  },
  appleButton: {
    width: '100%',
    height: 54,
  },
  appleLoading: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.85,
  },
  demoButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  demoText: {
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {},
  footerText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  link: {
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalHint: {
    fontSize: 13,
    marginBottom: 4,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  modalSubmit: {
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  modalSubmitDisabled: {
    opacity: 0.5,
  },
  modalSubmitText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  modalCancel: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '500',
  },
})
