import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useAuthStore } from '@/stores/authStore'
import { useEffect } from 'react'
import * as SecureStore from 'expo-secure-store'
import * as SplashScreen from 'expo-splash-screen'
import Constants from 'expo-constants'
import { initializeKakaoSDK } from '@react-native-kakao/core'
import { performNativeRefresh } from '@/api/client'
import { queryClient } from '@/lib/queryClient'
import { useThemeStore } from '@/stores/themeStore'
import { getPalette } from '@/theme/palette'
import { usePushRegistration } from '@/hooks/usePushRegistration'
import { useNotificationObserver } from '@/hooks/useNotificationObserver'
import { AppLockGate } from '@/components/AppLockGate'

function ThemedStatusBar() {
  const theme = useThemeStore((s) => s.theme)
  const palette = getPalette(theme)
  return <StatusBar style={palette.statusBarStyle} />
}

// bootstrap 완료 전까지 네이티브 스플래시 유지 · Login 화면 flash 방지
SplashScreen.preventAutoHideAsync().catch(() => {
  // 이미 hidden 이거나 지원 안 되는 환경 · 무시
})

/**
 * Root Layout — auth guard + provider 셋업.
 *
 * 플로우 (W3):
 *  1. Kakao SDK 초기화 (모듈 로드 시 1회)
 *  2. SecureStore JWT 조회
 *  3. JWT 있음 → GET /users/me 로 세션 검증
 *     - 200 → (tabs) 자동 진입
 *     - 401 → interceptor 가 clearAll → login 노출
 *  4. JWT 없음 → login 화면
 *
 * bootstrapping=true 동안 login 화면 노출 (스플래시 대체 · 시각적 잔상 최소)
 */

// Kakao SDK 초기화 · runtime 순서:
//   1) EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY (babel 트랜스폼 · 가장 확실)
//   2) Constants.expoConfig.extra.kakaoNativeAppKey (manifest)
const kakaoKey =
  (process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY as string | undefined) ||
  (Constants.expoConfig?.extra?.kakaoNativeAppKey as string | undefined)

if (kakaoKey) {
  try {
    initializeKakaoSDK(kakaoKey)
  } catch (err) {
    console.warn('[auth] Kakao SDK init 실패', err)
  }
} else {
  console.warn(
    '[auth] kakaoNativeAppKey 미설정 · .env EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY 확인',
  )
}


/**
 * Push 토큰 등록 (Step 2) + 수신 핸들러 (Step 3) 실행 전용 무렌더 컴포넌트.
 * ⚠️ 반드시 QueryClientProvider 안에서 렌더 — useNotificationObserver 가 useQueryClient 사용.
 * (RootLayout 에서 직접 호출하면 provider 밖이라 시작 즉시 크래시 — 2026-07-11 실기 크래시 원인)
 */
function NotificationRuntime() {
  usePushRegistration()
  useNotificationObserver()
  return null
}

export default function RootLayout() {
  const restoreToken = useAuthStore((s) => s.restoreToken)
  const clearAll = useAuthStore((s) => s.clearAll)
  const setBootstrapping = useAuthStore((s) => s.setBootstrapping)
  const token = useAuthStore((s) => s.token)
  const bootstrapping = useAuthStore((s) => s.bootstrapping)

  const router = useRouter()
  const segments = useSegments()


  // 앱 시작 · JWT 복원 + me 검증
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const savedToken = await SecureStore.getItemAsync('jwt')
        if (!savedToken) {
          if (!cancelled) setBootstrapping(false)
          return
        }
        restoreToken(savedToken)
        // 백엔드 GET /users/me 없음 · POST /auth/refresh 로 새 accessToken + user 획득.
        // 성공 시 performNativeRefresh 내부에서 epoch 확인 후 setSession 호출.
        await performNativeRefresh()
      } catch (err) {
        // ⚠️ fallthrough 금지 — response 있는 401 일 때만 clearAll.
        // 네트워크(response 부재)·409·429·5xx·epoch 변경 → 기존 SecureStore 토큰 유지하고
        // 로그인 상태로 진행(콜드스타트 순단 보호). 다음 요청·폴링이 자동 복구.
        const status = (err as { response?: { status?: number } })?.response
          ?.status
        if (!cancelled && status === 401) {
          await clearAll()
        }
      } finally {
        if (!cancelled) setBootstrapping(false)
        // 스플래시는 라우터가 실제 목적지로 이동 완료된 후에 hide (아래 별도 effect)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 라우터가 최종 목적지 도착 후 스플래시 hide · Login flash 방지
  useEffect(() => {
    if (bootstrapping) return
    const inTabs = segments[0] === '(tabs)'
    const inLogin = segments[0] === 'login'
    const arrived = (token && inTabs) || (!token && inLogin)
    if (arrived) {
      SplashScreen.hideAsync().catch(() => {})
    }
  }, [token, bootstrapping, segments])

  // token 상태에 따라 login ↔ (tabs) 라우팅
  useEffect(() => {
    if (bootstrapping) return
    const inTabs = segments[0] === '(tabs)'
    if (token && !inTabs) {
      router.replace('/(tabs)')
    } else if (!token && inTabs) {
      router.replace('/login')
    }
  }, [token, bootstrapping, segments, router])

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <NotificationRuntime />
        {/* StatusBar 는 웹 theme 에 따라 dynamic · themed component 아래 */}
        <ThemedStatusBar />
        {/* ① 앱 잠금 게이트 — 콜드스타트·background 복귀 시 생체 인증 오버레이 */}
        <AppLockGate>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="login" />
            <Stack.Screen name="(tabs)" />
            {/* 데모(둘러보기) — 비로그인 공개 · 탭 밖 단일 스크린 */}
            <Stack.Screen name="demo" />
          </Stack>
        </AppLockGate>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
