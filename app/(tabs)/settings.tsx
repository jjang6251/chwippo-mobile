import { AppWebView } from '@/components/AppWebView'

/**
 * 설정 탭 · 웹 `/settings` 통째 렌더.
 *
 * 웹 안에 이미 프로필 · 알림 · 도움말 · **로그아웃 · 회원 탈퇴** 다 있음.
 * Native 는 감지 (401 → clearAll · login redirect) 만 담당.
 */
export default function SettingsScreen() {
  return <AppWebView path="/settings" />
}
