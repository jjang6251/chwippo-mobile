import { useRouter } from 'expo-router'
import { AppWebView } from '@/components/AppWebView'

/**
 * 데모 탭 화면 공통 래퍼 — 웹 데모 라우트(/demo/*)를 웹뷰로 로드.
 *
 * demo prop → 로그인·랜딩·OAuth 이탈 URL 가로채기 + deadline-saved soft-ask 억제 자동 적용.
 * 이탈 감지 시 네이티브 로그인으로 복귀 — 탭 스택에선 router.back() 목적지가 애매하므로
 * router.replace('/login') 으로 확정 복귀(로그인은 Stack 루트 형제라 항상 유효).
 */
export function DemoTabScreen({ path }: { path: string }) {
  const router = useRouter()
  return (
    <AppWebView path={path} demo onExitDemo={() => router.replace('/login')} />
  )
}
