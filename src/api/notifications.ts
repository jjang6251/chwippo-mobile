import { apiClient } from './client'

/**
 * 인앱 알림 · 권한 상태 동기화 API.
 *
 * 백엔드에 unread 전용 endpoint 는 없음 · GET /notifications 응답의
 * unreadCount 필드를 사용한다 (웹 useUnreadCount 와 동일 계약).
 * PATCH /me/alarm-prompt 로 OS 권한 상태를 서버에 반영한다.
 */

interface NotificationListResult {
  items: unknown[]
  nextCursor: string | null
  unreadCount: number
}

export async function getUnreadCount(): Promise<number> {
  const res = await apiClient.get<NotificationListResult>('/notifications')
  return res.data.unreadCount
}

/** soft-ask 응답 · 앱 시작 시 OS 권한 상태 동기화. granted = OS 푸시 허용 여부. */
export async function syncAlarmPrompt(granted: boolean): Promise<void> {
  await apiClient.patch('/me/alarm-prompt', { granted })
}
