import { apiClient } from './client'

/**
 * Push device 등록 · 해제.
 *
 * POST   /me/devices          Expo push token 등록 (로그인 · 권한 승낙 시)
 * DELETE /me/devices/:token   best-effort 해제 (로그아웃 시)
 *
 * DTO 계약 (chwippo-back RegisterDeviceDto): deviceToken · platform · appVersion?
 */

export interface RegisterDeviceInput {
  deviceToken: string
  platform: 'ios' | 'android' | 'web'
  appVersion?: string
}

export async function registerDevice(input: RegisterDeviceInput): Promise<void> {
  await apiClient.post('/me/devices', input)
}

export async function deleteDevice(token: string): Promise<void> {
  await apiClient.delete(`/me/devices/${encodeURIComponent(token)}`)
}
