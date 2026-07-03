import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { useNavigation } from 'expo-router'
import type {
  ShouldStartLoadRequest,
  WebViewNavigation,
} from 'react-native-webview/lib/WebViewTypes'
import Constants from 'expo-constants'
import * as WebBrowser from 'expo-web-browser'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { getPalette } from '@/theme/palette'

/**
 * WebView wrapper — chwippo-front 웹 화면을 감쌈.
 *
 * ## 보안 (Apple Guideline 4.2 · G6 방어)
 *   - originWhitelist: chwippo 도메인 + Kakao OAuth 만
 *   - mixedContentMode: 'never'
 *   - allowFileAccessFromFileURLs: false
 *   - allowUniversalAccessFromFileURLs: false
 *   - javaScriptEnabled: true (필수 · 웹 앱)
 *
 * ## Auth 전달
 *   - Custom User-Agent 에 `chwippo-mobile-webview` 포함 → 웹의 `useNativeMode()` 감지 → MobileNav/Header hide
 *   - iOS WKWebView: `sharedCookiesEnabled` 로 refresh_token httpOnly cookie 자동 공유 → 웹이 /auth/refresh 로 세션 획득
 *   - fallback: `injectedJavaScriptBeforeContentLoaded` 로 accessToken sessionStorage 주입
 *
 * ## 외부 링크 처리 (심사 필수)
 *   - originWhitelist 밖 URL 클릭 시 `expo-web-browser.openBrowserAsync` (SFSafariViewController)
 *   - 앱 밖 Safari.app 절대 X · reject 위험
 *
 * ## 딥링크 · chwippo:// scheme
 *   - WebView 안 chwippo:// 링크는 native 라우팅 (지금은 없음 · 미래 대비)
 */

const WEB_URL =
  (Constants.expoConfig?.extra?.webUrl as string | undefined) ??
  'https://chwippo.com'

const CUSTOM_USER_AGENT = `chwippo-mobile-webview/${
  (Constants.expoConfig?.version as string | undefined) ?? '0.1.0'
}`

const ORIGIN_WHITELIST = [
  'https://*.chwippo.com',
  'https://chwippo.com',
  'https://kauth.kakao.com',
  'https://kapi.kakao.com',
]

/**
 * 광고 · 트래킹 도메인 — WebView 안에서도 로드 안 함 · SFSafariVC 도 안 열음.
 * chwippo-front 에 심긴 AdSense/Analytics 스크립트가 계속 요청 보내는 문제 차단.
 * Apple 4.2 심사 대비 · 광고 노출 있으면 통과율 감소.
 */
const BLOCKED_DOMAINS = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'google-analytics.com',
  'googletagmanager.com',
  'adservice.google.com',
]

function isBlockedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname
    return BLOCKED_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`),
    )
  } catch {
    return false
  }
}

interface AppWebViewProps {
  /** WebView 안에서 표시할 웹 페이지 path (예: '/calendar') */
  path: string
}

function buildFullUrl(path: string, accessToken: string | null): string {
  // native mode flag 를 항상 붙임 · UA 감지 실패 시 폴백
  const separator = path.includes('?') ? '&' : '?'
  const withNative = `${WEB_URL}${path}${separator}native=1`
  // accessToken 은 URL 로 넘기지 않음 (히스토리 유출 · injectedJS 로 전달)
  void accessToken
  return withNative
}

function buildInjectedJS(accessToken: string | null): string {
  // sessionStorage 로 seed 전달 · 웹이 이후 자체 axios refresh 로 갱신
  if (!accessToken) return ''
  const escaped = accessToken.replace(/[\\'"]/g, '\\$&')
  return `
    try {
      window.sessionStorage.setItem('chwippo:seed-access-token', '${escaped}');
    } catch (_) {}
    true;
  `
}

export function AppWebView({ path }: AppWebViewProps) {
  const token = useAuthStore((s) => s.token)
  const theme = useThemeStore((s) => s.theme)
  const palette = getPalette(theme)
  const webViewRef = useRef<WebView>(null)
  const currentUrlRef = useRef<string | null>(null)

  const fullUrl = useMemo(() => buildFullUrl(path, token), [path, token])
  const injectedJS = useMemo(() => buildInjectedJS(token), [token])

  // native theme 변경 시 · 이 WebView 안 data-theme + localStorage 강제 동기화
  //   - Settings tab 에서 theme 바꿀 때 → Calendar · Board 등 다른 tab WebView 도 즉시 반영
  //   - 각 WebView 는 별도 localStorage 라 이 injection 없으면 색 mismatch
  useEffect(() => {
    const js = `
      try {
        document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)});
        // localStorage 도 sync · 다음 페이지 로드 시 일관 유지 (실제 user choice 는 web store 가 관리)
        localStorage.setItem('chwippo-theme-resolved', ${JSON.stringify(theme)});
      } catch (_) {}
      true;
    `
    webViewRef.current?.injectJavaScript(js)
  }, [theme])

  // Tab 재탭 (`tabPress` event · 이미 focus 된 상태에서도 fire) — iOS 관례:
  //   1) sub-page 이면 base path 로 이동
  //   2) base path 면 스크롤 맨 위 (Twitter/X · Instagram 등 표준 UX)
  // useFocusEffect 는 focus 상태 재진입에만 fire · 재탭엔 안 됨. tabPress 로 정확히 잡음.
  const navigation = useNavigation()
  useEffect(() => {
    const nav = navigation as unknown as {
      addListener: (
        type: 'tabPress',
        cb: () => void,
      ) => () => void
      isFocused: () => boolean
    }
    if (!nav.addListener) return
    const unsub = nav.addListener('tabPress', () => {
      if (!nav.isFocused()) return
      const current = currentUrlRef.current
      if (!current) return
      try {
        const currentPath = new URL(current).pathname
        if (currentPath !== path) {
          webViewRef.current?.injectJavaScript(
            `window.location.href = ${JSON.stringify(fullUrl)}; true;`,
          )
        } else {
          webViewRef.current?.injectJavaScript(`
            try {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              document.querySelectorAll('[data-scroll-container], main').forEach(function(el) {
                if (el && el.scrollTo) el.scrollTo({ top: 0, behavior: 'smooth' });
              });
            } catch (_) {}
            true;
          `)
        }
      } catch {
        // URL 파싱 실패 · 무시
      }
    })
    return unsub
  }, [navigation, path, fullUrl])

  const isChwippoDomain = useCallback((url: string): boolean => {
    try {
      const u = new URL(url)
      return (
        u.hostname === 'chwippo.com' ||
        u.hostname.endsWith('.chwippo.com') ||
        u.hostname === 'kauth.kakao.com' ||
        u.hostname === 'kapi.kakao.com'
      )
    } catch {
      return false
    }
  }, [])

  const onShouldStartLoadWithRequest = useCallback(
    (request: ShouldStartLoadRequest): boolean => {
      const url = request.url

      // about:blank · data: · JS · blob 등 내부 스킴은 그대로 로드
      if (
        url.startsWith('about:') ||
        url.startsWith('data:') ||
        url.startsWith('blob:') ||
        url.startsWith('javascript:')
      ) {
        return true
      }

      // 광고 · 트래킹 → 조용히 차단 (SFSafariVC 열지도 않음)
      if (isBlockedDomain(url)) return false

      // 도메인 안 → WebView 로 유지
      if (isChwippoDomain(url)) return true

      // ⚠️ 밖의 URL 이더라도 아래 조건 다 만족해야 SFSafariVC 로 이관:
      //   1) top frame 이어야 함 (iframe · analytics beacon · iOS undefined 은 skip)
      //   2) navigationType 이 명확히 'click' (자동 리다이렉트 · form · analytics 제외)
      // 그 외 케이스는 WebView 안에서 조용히 처리 · UX 방해 X
      const isTopClick =
        request.isTopFrame === true && request.navigationType === 'click'

      if (!isTopClick) return true

      void WebBrowser.openBrowserAsync(url).catch(() => {})
      return false
    },
    [isChwippoDomain],
  )

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as
        | { type: 'theme'; theme: 'dark' | 'light' }
        | { type: 'logout' }
        | { type: 'account-deleted' }
        | { type: string }

      if (msg.type === 'theme') {
        const t = (msg as { theme: 'dark' | 'light' }).theme
        if (t === 'dark' || t === 'light') {
          useThemeStore.getState().setTheme(t)
        }
        return
      }
      if (msg.type === 'logout' || msg.type === 'account-deleted') {
        // native 즉시 세션 clear (다음 401 대기 X)
        void useAuthStore.getState().clearAll()
        return
      }
    } catch {
      // JSON 파싱 실패 · 무시 (외부 postMessage 방어)
    }
  }, [])

  const onNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    currentUrlRef.current = nav.url
    // 필요 시 URL 관찰 (예: /login redirect 감지 → native logout 트리거) · W4 B 에서 확장
  }, [])

  return (
    // top edge · 상단 노치 · 상태바 (시각 · WiFi) 아래로 콘텐츠 밀어 안전 영역 확보
    // 하단은 native tab bar 가 이미 안전 영역 관리
    <SafeAreaView
      style={[styles.container, { backgroundColor: palette.bg }]}
      edges={['top']}
    >
      <WebView
        ref={webViewRef}
        source={{ uri: fullUrl }}
        style={[styles.webview, { backgroundColor: palette.bg }]}
        originWhitelist={ORIGIN_WHITELIST}
        userAgent={CUSTOM_USER_AGENT}
        applicationNameForUserAgent={CUSTOM_USER_AGENT}
        // 보안 옵션 (Apple 4.2 · G6)
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mixedContentMode="never"
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        allowsBackForwardNavigationGestures={true}
        // iOS Cookie 공유 (refresh_token 자동 왕복)
        sharedCookiesEnabled={Platform.OS === 'ios'}
        thirdPartyCookiesEnabled={Platform.OS === 'android'}
        // Auth seed 주입 (fallback · cookie 공유가 primary)
        injectedJavaScriptBeforeContentLoaded={injectedJS}
        // 외부 링크 SFSafariVC 로 이관
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onMessage={onMessage}
        onNavigationStateChange={onNavigationStateChange}
        startInLoadingState={true}
        renderLoading={() => (
          <View
            style={[styles.loading, { backgroundColor: palette.bg }]}
          >
            <ActivityIndicator color={palette.brand} />
          </View>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
