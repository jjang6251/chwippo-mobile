import { useEffect } from 'react'
import { AppState } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getUnreadCount } from '@/api/notifications'
import { useAuthStore } from '@/stores/authStore'

/** 종 배지 unread 카운트 query key (수신 핸들러 · foreground 갱신에서 공용 invalidate) */
export const UNREAD_COUNT_KEY = ['notifications', 'unread-count'] as const

/**
 * 종 배지용 안 읽음 개수.
 *  - 60초 폴링 + 앱 foreground 복귀 시 즉시 갱신
 *  - 로그인 전(token 없음)엔 조회 안 함 · 0 반환
 */
export function useNotificationBadge(): number {
  const token = useAuthStore((s) => s.token)
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: getUnreadCount,
    enabled: !!token,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  // 앱 foreground 복귀 시 즉시 갱신
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && useAuthStore.getState().token) {
        void qc.invalidateQueries({ queryKey: UNREAD_COUNT_KEY })
      }
    })
    return () => sub.remove()
  }, [qc])

  return token ? (data ?? 0) : 0
}
