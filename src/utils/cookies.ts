import { Platform } from 'react-native'
import { API_URL } from '@/api/client'

/**
 * 네이티브 쿠키 저장소에 박제된 refresh_token 제거 (iOS 전용).
 *
 * ## 왜 필요한가
 * react-native-webview 의 iOS 구현은 웹뷰 소스를 세팅할 때마다
 * `NSHTTPCookieStorage`(= 네이티브 axios 가 쓰는 저장소) 의 쿠키를 웹뷰 쿠키 저장소로
 * **전량 덮어쓴다** (RNCWebViewImpl `syncCookiesToWebView`). 로그인 응답으로 네이티브
 * 저장소에 남은 구세대 refresh_token 이 있으면 탭 전환·재마운트·reload 때마다 웹뷰의
 * 최신 RT 를 구세대로 되돌리고, 그 구세대가 서버에 도착하는 순간 재사용 탈취로 판정돼
 * 토큰 체인이 revoke → 오탐 로그아웃. 웹뷰 시드가 끝난 뒤(첫 로드 완료) 네이티브 사본을
 * 지우면 되살릴 구세대 자체가 없어진다.
 *
 * 네이티브는 더 이상 회전(/auth/refresh)을 하지 않으므로 이 쿠키를 쓸 일도 없다
 * (src/api/client.ts 401 정책).
 *
 * ## 🔴 Android 에서 절대 호출하면 안 된다
 * RN Android 는 `ForwardingCookieHandler` 로 네이티브 OkHttp 와 WebView 가 **하나의**
 * `android.webkit.CookieManager` 를 공유한다. 네이티브 쪽을 지우면 웹뷰 쿠키까지 같이
 * 지워져 그 자리에서 로그아웃된다. 그래서 iOS 로 명시 분기하고, 네이티브 모듈도
 * Android autolinking 에서 제외해 뒀다 (루트 react-native.config.js).
 *
 * best-effort — 실패해도 흐름을 깨지 않는다.
 */
export async function clearNativeRefreshTokenCookie(): Promise<void> {
  if (Platform.OS !== 'ios') return
  try {
    // 지연 require — 이 모듈의 index.js 는 네이티브 모듈이 없으면 **평가 시점에** invariant
    // 로 throw 한다. Android(autolinking 제외)와 구 네이티브 빌드(OTA 로 이 JS 만 먼저
    // 내려간 경우) 에서 앱이 죽지 않도록 iOS 분기 안에서 try 로 감싸 평가한다.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const CookieManager = require('@react-native-cookies/cookies') as {
      clearByName: (
        url: string,
        name: string,
        useWebKit?: boolean,
      ) => Promise<boolean>
    }
    // useWebKit=false → NSHTTPCookieStorage(네이티브)만 대상. 웹뷰의 최신 RT
    // (WKWebsiteDataStore)는 건드리지 않는다. 이름·도메인이 모두 일치하는 쿠키 1개만
    // 삭제 — 전체 clear 아님.
    await CookieManager.clearByName(API_URL, 'refresh_token', false)
  } catch {
    // 네이티브 모듈 미링크 · 삭제 실패 — 무시 (best-effort)
  }
}
