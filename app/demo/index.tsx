import { DemoTabScreen } from '@/components/DemoTabScreen'

/** 데모 홈 탭 · 캘린더 (실서비스 index=/calendar 미러 → /demo/calendar). */
export default function DemoCalendarScreen() {
  return <DemoTabScreen path="/demo/calendar" />
}
