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

/**
 * App Review(App Store Guideline 2.1) 전용 리뷰어 로그인 — 카카오 계정을 만들 수 없는
 * 심사관용 우회 경로. EXPO_PUBLIC_REVIEWER_MODE 빌드에서만 노출되는 숨김 UI 가 호출.
 * 성공 시 카카오/Apple 과 동일한 LoginResponse (accessToken · user).
 */
export async function reviewerLogin(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>('/auth/reviewer-login', {
    email,
    password,
  })
  return res.data
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout').catch(() => {
    // 서버에서 실패해도 로컬 정리는 계속
  })
}

// 🔴 세션 갱신(/auth/refresh) 함수는 여기에도 client.ts 에도 없다 — refresh 회전 주체는
// 웹뷰 하나다. 네이티브가 다시 회전하면 시간차로 구세대 RT 가 서버에 도착해 재사용 탈취로
// 판정되고 토큰 체인이 revoke 되어 오탐 로그아웃이 재발한다 (client.ts 401 정책 참조).

export async function deleteMyAccount(): Promise<void> {
  await apiClient.delete('/users/me')
}
