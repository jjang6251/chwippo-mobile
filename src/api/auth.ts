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
  authorizationCode?: string | null,
): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>('/auth/apple/native', {
    identityToken,
    fullName,
    // 탈퇴 시 Apple revoke 용 · 첫 로그인/재로그인마다 발급 (best-effort 저장)
    ...(authorizationCode ? { authorizationCode } : {}),
  })
  return res.data
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout').catch(() => {
    // 서버에서 실패해도 로컬 정리는 계속
  })
}

// 세션 갱신은 client.ts performNativeRefresh() 로 일원화 (인터셉터 없는 plain axios).
// apiClient 경유 refresh 는 401 재귀·이중 경로 위험이 있어 여기서 제공하지 않는다.

export async function deleteMyAccount(): Promise<void> {
  await apiClient.delete('/users/me')
}
