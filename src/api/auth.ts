import { apiClient } from './client'
import type { AuthUser } from '@/stores/authStore'

/**
 * 인증 관련 API 호출.
 *
 * POST /auth/kakao/native · POST /auth/apple/native — 로그인
 * POST /auth/logout — 로그아웃 (refresh_token cookie 무효화)
 * GET  /users/me — 세션 검증 · 사용자 정보 갱신
 * DELETE /users/me — 회원 탈퇴
 */

interface LoginResponse {
  accessToken: string
  isNew: boolean
  user: AuthUser
}

export async function kakaoNativeLogin(
  accessToken: string,
): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>('/auth/kakao/native', {
    accessToken,
  })
  return res.data
}

interface AppleFullName {
  givenName?: string | null
  familyName?: string | null
}

export async function appleNativeLogin(
  identityToken: string,
  fullName?: AppleFullName,
): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>('/auth/apple/native', {
    identityToken,
    fullName,
  })
  return res.data
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout').catch(() => {
    // 서버에서 실패해도 로컬 정리는 계속
  })
}

/**
 * 세션 갱신 · POST /auth/refresh 사용 (백엔드는 /users/me 별도 endpoint 없음).
 * refresh_token cookie 로 인증 · 새 accessToken + user 반환.
 * 앱 시작 시 자동 로그인 · 401 대응에 사용.
 */
export async function refreshSession(): Promise<{
  accessToken: string
  user: AuthUser
}> {
  const res = await apiClient.post<{ accessToken: string; user: AuthUser }>(
    '/auth/refresh',
  )
  return res.data
}

export async function deleteMyAccount(): Promise<void> {
  await apiClient.delete('/users/me')
}
