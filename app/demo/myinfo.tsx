import { DemoTabScreen } from '@/components/DemoTabScreen'

/** 데모 내정보 탭 (실서비스 myinfo=/myinfo 미러 → /demo/myinfo). */
export default function DemoMyInfoScreen() {
  return <DemoTabScreen path="/demo/myinfo" />
}
