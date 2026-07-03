import { AppWebView } from '@/components/AppWebView'

/**
 * 회고 탭 · 성장 페이지 (chwippo-front `/dashboard`).
 *
 * 회고=성장 재정의 이후 대시보드 = milestones · monthly comparison · funnel · insights.
 * 활동 일지 진입은 이 페이지 안에서 (또는 별도 링크).
 */
export default function GrowthScreen() {
  return <AppWebView path="/dashboard" />
}
