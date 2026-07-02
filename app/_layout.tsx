import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useAuthStore } from '@/stores/authStore'
import { useEffect } from 'react'
import * as SecureStore from 'expo-secure-store'

/**
 * Root Layout — auth guard + provider 셋업.
 *
 * 플로우:
 *  1. 앱 시작 → SecureStore 에서 JWT 확인
 *  2. JWT 있으면 → (tabs) 홈
 *  3. JWT 없으면 → login 화면
 *
 * W2 shell 단계 · 실 Kakao/SIWA 로그인은 W3.
 */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
})

export default function RootLayout() {
  const setToken = useAuthStore((s) => s.setToken)

  useEffect(() => {
    // 앱 시작 시 저장된 JWT 복원
    // Simulator (unsigned build) 에서 keychain 접근 실패 가능 · 실 배포에는 정상
    SecureStore.getItemAsync('jwt')
      .then((token) => {
        if (token) setToken(token)
      })
      .catch((err) => {
        console.warn('[auth] SecureStore read failed:', err)
      })
  }, [setToken])

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
