import { AppWebView } from '@/components/AppWebView'

/**
 * 공부 노트 탭 (chwippo-front `/study-notes`) — 탭 스왑: 내정보 → 공부 노트
 * (CEO 결정 2026-08-18 · 네이티브 반영 2026-08-19).
 * 내정보는 탭에서만 빠졌다 — 웹뷰 안 /myinfo 라우트·진입 CTA 로 그대로 접근된다.
 */
export default function StudyNotesScreen() {
  return <AppWebView path="/study-notes" />
}
