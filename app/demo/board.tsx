import { DemoTabScreen } from '@/components/DemoTabScreen'

/** 데모 보드 탭 (실서비스 board=/board 미러 → /demo/board). */
export default function DemoBoardScreen() {
  return <DemoTabScreen path="/demo/board" />
}
