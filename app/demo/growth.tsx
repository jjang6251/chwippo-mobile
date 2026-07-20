import { DemoTabScreen } from '@/components/DemoTabScreen'

/** 데모 회고 탭 (실서비스 growth=/dashboard 미러 → /demo/dashboard). */
export default function DemoGrowthScreen() {
  return <DemoTabScreen path="/demo/dashboard" />
}
