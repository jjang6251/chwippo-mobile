import { QueryClient } from '@tanstack/react-query'

/**
 * 앱 전역 QueryClient — RootLayout Provider 와 hook 밖 접근(AppWebView
 * onMessage 의 배지 invalidate · 로그아웃 캐시 클리어)이 공유.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
})
