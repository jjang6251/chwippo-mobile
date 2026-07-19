import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  WebViewErrorEvent,
  WebViewNavigation,
} from 'react-native-webview/lib/WebViewTypes'
import Constants from 'expo-constants'
import * as WebBrowser from 'expo-web-browser'
import * as Network from 'expo-network'
import { useAuthStore } from '@/stores/authStore'
import { useAppLockStore } from '@/stores/appLockStore'
import { OfflineScreen } from '@/components/OfflineScreen'
import { useThemeStore } from '@/stores/themeStore'
import { getPalette } from '@/theme/palette'
import { queryClient } from '@/lib/queryClient'
import { UNREAD_COUNT_KEY } from '@/hooks/useNotificationBadge'
import { useWebNavStore } from '@/stores/webNavStore'
import {
  openNotificationSettingsOrRequest,
  requestPermissionAndRegister,
  unregisterCurrentDevice,
} from '@/utils/push'
import {
  recordValueMomentPrompt,
  shouldShowValueMomentSoftAsk,
} from '@/utils/softAsk'
import { syncAlarmPrompt } from '@/api/notifications'
import { PermissionSoftAskModal } from '@/components/PermissionSoftAskModal'

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
 *   - accessToken seed 주입 제거됨 — 쿠키 공유가 유일 경로 (웹 소비처 0 · sessionStorage 평문 토큰 표면 제거)
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

/**
 * WEB_URL 의 호스트 — dev(localhost · 127.0.0.1 · LAN IP)를 하드코딩 없이
 * WebView 허용 판정에 반영. prod 는 chwippo.com.
 */
const WEB_HOST = (() => {
  try {
    return new URL(WEB_URL).hostname
  } catch {
    return ''
  }
})()

const CUSTOM_USER_AGENT = `chwippo-mobile-webview/${
  (Constants.expoConfig?.version as string | undefined) ?? '0.1.0'
}`

/**
 * WebView 안 로드를 허용하는 origin (Apple 4.2 · G6 origin 제한).
 *   - chwippo 계열: 앱 웹 화면 · API
 *   - kauth/kapi.kakao.com: 웹 로그인 잔존 OAuth 흐름(웹 /login → api /auth/kakao
 *     → 302 kauth.kakao.com → kapi.kakao.com)을 위해 유지. SFSafariVC 로 열면
 *     세션 쿠키가 WebView 로 돌아오지 않아 로그인 복구가 깨지므로 반드시 WebView
 *     안에서 처리해야 함 (정당한 인증 도메인 예외 · 심사 가이드 허용).
 *     평상시 네이티브 로그인은 Kakao SDK 원탭 · SIWA 네이티브라 이 경로 미사용.
 *   - http://localhost · 127.0.0.1: 로컬 개발용 (EXPO_PUBLIC_WEB_URL=http://localhost:5173)
 */
const ORIGIN_WHITELIST = [
  'https://*.chwippo.com',
  'https://chwippo.com',
  'https://kauth.kakao.com',
  'https://kapi.kakao.com',
  'http://localhost:*',
  'http://127.0.0.1:*',
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

/**
 * ② 오프라인으로 간주할 WebView 로드 에러 코드 (iOS NSURLError · 네트워크 가용성 계열).
 *   -1009 미연결 · -1001 타임아웃 · -1004 호스트 연결 실패 · -1005 연결 유실 · -1003 호스트 못 찾음.
 * SSL(-1200)·잘못된 URL(-1000)·서버 응답 오류(-1011) 등은 오프라인이 아니므로 제외.
 */
const NETWORK_ERROR_CODES = new Set([-1009, -1001, -1004, -1005, -1003])

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

function buildFullUrl(path: string): string {
  // native mode flag 를 항상 붙임 · UA 감지 실패 시 폴백
  const separator = path.includes('?') ? '&' : '?'
  return `${WEB_URL}${path}${separator}native=1`
}

export function AppWebView({ path }: AppWebViewProps) {
  const theme = useThemeStore((s) => s.theme)
  const palette = getPalette(theme)
  const webViewRef = useRef<WebView>(null)
  const currentUrlRef = useRef<string | null>(null)
  // ⑦ 가치 순간 soft-ask 모달 (deadline-saved 수신 + 쿨다운 통과 시)
  const [softAskVisible, setSoftAskVisible] = useState(false)

  // ② 오프라인 감지 — 네트워크 미연결 또는 WebView 로드 에러(네트워크 계열)
  const netState = Network.useNetworkState()
  const [loadError, setLoadError] = useState(false)
  const offline = netState.isConnected === false || loadError

  const fullUrl = useMemo(() => buildFullUrl(path), [path])

  // ② 연결 복구 시 자동 복귀 — 오프라인이었다가 다시 연결되면 loadError 해제 + reload
  const wasOfflineRef = useRef(false)
  useEffect(() => {
    if (netState.isConnected === false) {
      wasOfflineRef.current = true
    } else if (netState.isConnected === true && wasOfflineRef.current) {
      wasOfflineRef.current = false
      setLoadError(false)
      webViewRef.current?.reload()
    }
  }, [netState.isConnected])

  // ② WebView 네트워크 로드 에러 → 오프라인 화면 (Safari 흰 에러 화면 노출 방지).
  // iOS NSURLError 중 네트워크 가용성 계열만 처리 (SSL·잘못된 URL·서버 응답 오류 제외).
  const onError = useCallback((e: WebViewErrorEvent) => {
    if (NETWORK_ERROR_CODES.has(e.nativeEvent.code)) {
      setLoadError(true)
    }
  }, [])

  const handleOfflineRetry = useCallback(() => {
    setLoadError(false)
    webViewRef.current?.reload()
  }, [])

  // ① 앱 잠금 상태 회신 — 웹으로 CustomEvent(chwippo:app-lock-state) 주입.
  //   native → web 은 injectJavaScript 관례 (theme·navigation 동일).
  const replyAppLockState = useCallback(() => {
    const { enabled, supported } = useAppLockStore.getState()
    const detail = JSON.stringify({ supported, enabled })
    webViewRef.current?.injectJavaScript(`
      try {
        window.dispatchEvent(new CustomEvent('chwippo:app-lock-state', { detail: ${detail} }));
      } catch (_) {}
      true;
    `)
  }, [])

  // ① 웹 설정 "앱 잠금" 섹션 → 현재 상태 조회
  const handleGetAppLock = useCallback(async () => {
    await useAppLockStore.getState().ensureHydrated()
    replyAppLockState()
  }, [replyAppLockState])

  // ① 웹 설정 토글 → 앱 잠금 on/off 저장 (지원 기기에서만) + 상태 회신
  const handleSetAppLock = useCallback(
    async (enabled: boolean) => {
      const store = useAppLockStore.getState()
      await store.ensureHydrated()
      if (store.supported) await store.setEnabled(enabled)
      replyAppLockState()
    },
    [replyAppLockState],
  )

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

  // WebView 네비게이션 인텐트 (NativeHeader 종 · push 딥링크) 수신.
  //   - webNavStore.nonce 변경 시 마운트된 모든 AppWebView 가 effect 실행 →
  //     focus 된 탭의 WebView 만 자신의 location.href 를 target 으로 이동.
  //   - 초기 nonce(0) 는 skip · killed 상태 콜드스타트 딥링크도 마운트 후 1회 반영.
  const navNonce = useWebNavStore((s) => s.nonce)
  const lastNavNonceRef = useRef(0)
  useEffect(() => {
    if (navNonce === lastNavNonceRef.current) return
    lastNavNonceRef.current = navNonce
    const nav = navigation as unknown as { isFocused?: () => boolean }
    if (!nav.isFocused?.()) return
    const target = useWebNavStore.getState().target
    if (!target) return
    const url = buildFullUrl(target)
    webViewRef.current?.injectJavaScript(
      `window.location.href = ${JSON.stringify(url)}; true;`,
    )
  }, [navNonce, navigation])

  const isChwippoDomain = useCallback((url: string): boolean => {
    try {
      const u = new URL(url)
      return (
        u.hostname === 'chwippo.com' ||
        u.hostname.endsWith('.chwippo.com') ||
        // 카카오 OAuth 잔존 흐름 (ORIGIN_WHITELIST 주석 참조)
        u.hostname === 'kauth.kakao.com' ||
        u.hostname === 'kapi.kakao.com' ||
        // 로컬 개발 (localhost · 127.0.0.1 · LAN IP = WEB_HOST)
        u.hostname === 'localhost' ||
        u.hostname === '127.0.0.1' ||
        (WEB_HOST !== '' && u.hostname === WEB_HOST)
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
        | { type: 'request-notification-permission' }
        | { type: 'open-notification-settings' }
        | { type: 'notifications-read' }
        | { type: 'deadline-saved' }
        | { type: 'get-app-lock' }
        | { type: 'set-app-lock'; enabled: boolean }
        | { type: string }

      if (msg.type === 'theme') {
        const t = (msg as { theme: 'dark' | 'light' }).theme
        if (t === 'dark' || t === 'light') {
          useThemeStore.getState().setTheme(t)
        }
        return
      }
      if (msg.type === 'logout' || msg.type === 'account-deleted') {
        // push 기기 해제를 JWT 삭제 전에 시도 — clearAll 이 SecureStore 를 먼저
        // 지워 이후의 DELETE /me/devices 가 무인증 401 로 조용히 실패하면
        // 로그아웃 뒤에도 이전 계정 push 가 계속 도착. 오프라인 대비 1.5s 상한.
        void Promise.race([
          unregisterCurrentDevice(),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]).finally(() => {
          void useAuthStore.getState().clearAll()
          // 계정 전환 잔상 방지 — 이전 계정 배지 캐시 제거
          queryClient.clear()
        })
        return
      }
      // 웹 알림센터 읽음 처리 완료 → native 종 배지 즉시 갱신
      if (msg.type === 'notifications-read') {
        void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_KEY })
        return
      }
      // soft-ask "알림 받기" → OS 권한 요청 → alarm-prompt 동기화 + 승낙 시 등록.
      // (웹 PermissionPromptModal 은 fire-and-forget · 응답을 기다리지 않으므로 회신 X)
      if (msg.type === 'request-notification-permission') {
        void requestPermissionAndRegister()
        return
      }
      // 권한 거부 상태에서 "알림 받기" → 앱 설정으로 이동 (iOS 재프롬프트 불가 대응).
      // undetermined(첫 요청 전)이면 OS 프롬프트 직접 요청 — 헬퍼 참조.
      if (msg.type === 'open-notification-settings') {
        void openNotificationSettingsOrRequest()
        return
      }
      // ⑦ 마감일 저장(가치 순간) → 권한 undetermined + 쿨다운(2주) 통과 시 soft-ask 노출.
      // OS 프롬프트는 승낙 시에만 (소진 방지). 기존 앱시작 동기화·설정 CTA 경로엔 영향 없음.
      if (msg.type === 'deadline-saved') {
        void shouldShowValueMomentSoftAsk().then((show) => {
          if (show) setSoftAskVisible(true)
        })
        return
      }
      // ① 앱 잠금 — 웹 설정 섹션 상태 조회 (지원 여부 + 현재 on/off 회신)
      if (msg.type === 'get-app-lock') {
        void handleGetAppLock()
        return
      }
      // ① 앱 잠금 — 웹 설정 토글 → 저장 + 상태 회신
      if (msg.type === 'set-app-lock') {
        void handleSetAppLock((msg as { enabled?: unknown }).enabled === true)
        return
      }
    } catch {
      // JSON 파싱 실패 · 무시 (외부 postMessage 방어)
    }
  }, [handleGetAppLock, handleSetAppLock])

  const onNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    currentUrlRef.current = nav.url
    // 필요 시 URL 관찰 (예: /login redirect 감지 → native logout 트리거) · W4 B 에서 확장
  }, [])

  // ⑦ soft-ask '알림 받기' — 로컬 앵커 갱신 + OS 권한 요청/등록 (승낙 시 서버도 동기화)
  const handleSoftAskAllow = useCallback(() => {
    setSoftAskVisible(false)
    void recordValueMomentPrompt()
    void requestPermissionAndRegister()
  }, [])

  // ⑦ soft-ask '나중에' — 로컬 쿨다운 앵커 + 서버 promptedAt 기록 (기존 계약 재사용)
  const handleSoftAskDismiss = useCallback(() => {
    setSoftAskVisible(false)
    void recordValueMomentPrompt()
    void syncAlarmPrompt(false).catch(() => {})
  }, [])

  return (
    // top 안전 영역은 이제 NativeHeader(Tabs header)가 관리 · 여기선 중복 inset 방지
    // 하단은 native tab bar 가 이미 안전 영역 관리
    <SafeAreaView
      style={[styles.container, { backgroundColor: palette.bg }]}
      edges={[]}
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
        // 외부 링크 SFSafariVC 로 이관
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onMessage={onMessage}
        onNavigationStateChange={onNavigationStateChange}
        // ② 네트워크 로드 에러 → 오프라인 화면 (Safari 흰 에러 화면 방지)
        onError={onError}
        startInLoadingState={true}
        renderLoading={() => (
          <View
            style={[styles.loading, { backgroundColor: palette.bg }]}
          >
            <ActivityIndicator color={palette.brand} />
          </View>
        )}
      />
      <PermissionSoftAskModal
        visible={softAskVisible}
        onAllow={handleSoftAskAllow}
        onDismiss={handleSoftAskDismiss}
      />
      {/* ② 오프라인 오버레이 — 네트워크 미연결 또는 로드 에러 시 */}
      {offline && <OfflineScreen onRetry={handleOfflineRetry} />}
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
