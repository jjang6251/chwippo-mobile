import { AppWebView } from '@/components/AppWebView'

/**
 * 홈 탭 · 캘린더 (chwippo-front `/calendar`).
 *
 * 캘린더 UX 재구성 이후 홈=캘린더 로 확정 (웹 라우팅도 동일).
 */
export default function HomeScreen() {
  return <AppWebView path="/calendar" />
}
