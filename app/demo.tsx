import { useRouter } from 'expo-router'
import { AppWebView } from '@/components/AppWebView'

/**
 * 데모(둘러보기) 스크린 — 비로그인 공개. 탭 밖 단일 Stack 스크린 (탭바는 로그인 후 전용).
 *
 * chwippo-front `/demo/calendar` 를 웹뷰로 로드. 데모 안에서 로그인·랜딩·OAuth 로
 * 이탈하려 하면 AppWebView 가 URL 을 가로채(demo + onExitDemo) 네이티브 로그인으로 복귀시킨다.
 * (login → router.push('/demo') 로 진입하므로 router.back() 이 곧 네이티브 로그인 복귀)
 */
export default function DemoScreen() {
  const router = useRouter()
  return <AppWebView path="/demo/calendar" demo onExitDemo={() => router.back()} />
}
