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
 * 플로우 (refresh 회전 단일 주체화 — 회전·세션 판정은 웹뷰가 전담):
 *  1. Kakao SDK 초기화 (모듈 로드 시 1회)
 *  2. SecureStore JWT 조회
 *  3. JWT 있음 → **낙관 진입** ((tabs)). 네이티브는 세션 검증(네트워크 호출)을 하지 않는다
 *     - 실판정은 웹뷰 AuthGuard 의 POST /auth/refresh 가 담당
 *     - 실패(401) 시 웹이 postMessage({type:'logout'}) → AppWebView 가 clearAll → login
 *  4. JWT 없음 → login 화면
 *
 * 🔴 계약 — 낙관 진입 시 SecureStore 의 access 가 이미 만료였을 수 있다:
 *  - 네이티브 API 3종(푸시 기기등록 · alarm-prompt · 종 배지)은 401 로 **조용히 실패**한다.
 *    네이티브는 회전도 로그아웃도 하지 않는다 (src/api/client.ts 401 정책)
 *  - 웹뷰가 회전에 성공하면 {type:'token'} 브리지로 새 access 를 밀어 넣으므로
 *    다음 주기(배지 60s 폴링 등)에 자연 회복한다
 *  - 네이티브 회전을 되살리면 회전 주체가 다시 둘이 되어 구세대 RT 재사용 오탐이 재발한다
 *
 * bootstrapping=true 동안 네이티브 스플래시 유지 (Login 화면 flash 방지)
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
  const setBootstrapping = useAuthStore((s) => s.setBootstrapping)
  const token = useAuthStore((s) => s.token)
  const bootstrapping = useAuthStore((s) => s.bootstrapping)

  const router = useRouter()
  const segments = useSegments()


  // 앱 시작 · JWT 존재 여부만으로 낙관 진입 (네트워크 검증 없음 — 위 계약 참조)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const savedToken = await SecureStore.getItemAsync('jwt')
        if (!cancelled && savedToken) restoreToken(savedToken)
      } catch (err) {
        // Keychain 접근 실패 — 토큰 없는 것으로 간주하고 login 화면으로.
        // (여기서 clearAll 은 하지 않는다. 읽기 실패일 뿐 세션 만료 판정이 아님)
        console.warn('[auth] SecureStore read failed', err)
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
            {/* 데모(둘러보기) — 비로그인 공개 · app/demo/ 중첩 탭 네비게이터(실서비스 (tabs) 미러) */}
            <Stack.Screen name="demo" />
          </Stack>
        </AppLockGate>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
