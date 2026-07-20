import { DemoTabScreen } from '@/components/DemoTabScreen'

/**
 * 데모 설정 탭 (실서비스 settings=/settings 미러 → /demo/settings).
 * 웹 /demo/settings 미배포 상태에선 운영 웹의 데모 wildcard 가 /demo/calendar 로 리다이렉트
 * → 앱은 정상(캘린더 표시). front 배포 후 실 설정 골격 노출.
 */
export default function DemoSettingsScreen() {
  return <DemoTabScreen path="/demo/settings" />
}
