import { useEffect, useRef } from 'react'
import * as Notifications from 'expo-notifications'
import { useQueryClient } from '@tanstack/react-query'
import { useWebNavStore } from '@/stores/webNavStore'
import { UNREAD_COUNT_KEY } from '@/hooks/useNotificationBadge'

/**
 * 알림 수신 핸들러. (mobile Step 3)
 *
 *  - foreground 표시 정책: 배너 O · 리스트 O · 사운드 O (모듈 로드 시 1회 설정)
 *  - foreground 수신 → 종 배지 갱신
 *  - 탭(response) → data.deepLink 파싱 후 현재 WebView 를 해당 경로로 이동
 *    · 잘못된/없는 deepLink 는 /notifications fallback
 *  - killed 상태에서 알림 탭 진입: getLastNotificationResponseAsync 로 1회 처리
 */

// foreground 표시 정책 (모듈 로드 시 1회)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

/**
 * push data 에서 안전한 in-app deepLink 추출.
 * 반드시 단일 '/' 로 시작하는 내부 경로만 허용 (외부 URL · '//' 방어).
 */
function resolveDeepLink(data: unknown): string {
  if (data && typeof data === 'object' && 'deepLink' in data) {
    const dl = (data as { deepLink?: unknown }).deepLink
    if (typeof dl === 'string' && dl.startsWith('/') && !dl.startsWith('//')) {
      return dl
    }
  }
  return '/notifications'
}

export function useNotificationObserver(): void {
  const qc = useQueryClient()
  const handledInitialRef = useRef(false)

  useEffect(() => {
    // killed 상태에서 알림 탭으로 진입한 경우 1회 처리
    void (async () => {
      try {
        const last = await Notifications.getLastNotificationResponseAsync()
        if (last && !handledInitialRef.current) {
          handledInitialRef.current = true
          const path = resolveDeepLink(last.notification.request.content.data)
          useWebNavStore.getState().requestNavigate(path)
        }
      } catch {
        // ignore
      }
    })()

    // foreground 수신 → 배지 갱신
    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      void qc.invalidateQueries({ queryKey: UNREAD_COUNT_KEY })
    })

    // 탭 → 딥링크 이동 + 배지 갱신
    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const path = resolveDeepLink(response.notification.request.content.data)
        useWebNavStore.getState().requestNavigate(path)
        void qc.invalidateQueries({ queryKey: UNREAD_COUNT_KEY })
      },
    )

    return () => {
      receivedSub.remove()
      responseSub.remove()
    }
  }, [qc])
}
