import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
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
  markSoftAskShown,
  recordValueMomentPrompt,
  shouldShowValueMomentSoftAsk,
} from '@/utils/softAsk'
import { clearNativeRefreshTokenCookie } from '@/utils/cookies'
import * as refreshLock from '@/utils/refreshLockManager'
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
 *   - 🔴 refresh 회전 주체는 웹뷰 하나 — 웹이 회전에 성공할 때마다 `{type:'token'}` 으로 새
 *     access 를 네이티브에 밀어 준다(네이티브는 회전 안 함). 첫 로드 완료 후 iOS 네이티브
 *     쿠키 저장소의 refresh_token 박제를 지운다 (onLoadEnd · utils/cookies.ts 참조)
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

/** 앱(chwippo-front) · API 호스트인지 — kakao OAuth 도메인은 제외. */
function isAppHost(hostname: string): boolean {
  return (
    hostname === 'chwippo.com' ||
    hostname.endsWith('.chwippo.com') ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    (WEB_HOST !== '' && hostname === WEB_HOST)
  )
}

const DEMO_AUTH_EXIT_PATHS = new Set(['/', '/login', '/login/callback'])

/**
 * 데모(비로그인) 웹뷰 안에서 `/demo` 밖 "로그인·랜딩·OAuth 시작" URL 인지.
 *   - 둘러보기 종료(→ '/'), 로그인(→ '/login'), 소셜 로그인 시작(→ '/auth/*')
 *   - 앱/ API 호스트만 대상 (kakao OAuth 도메인은 여기 오기 전 '/auth/*' 에서 이미 가로챔)
 * true 면 웹 로그인·OAuth 를 웹뷰에서 열지 않고 네이티브 로그인 화면으로 복귀시킨다.
 */
function isDemoAuthExit(url: string): boolean {
  try {
    const u = new URL(url)
    if (!isAppHost(u.hostname)) return false
    return DEMO_AUTH_EXIT_PATHS.has(u.pathname) || u.pathname.startsWith('/auth/')
  } catch {
    return false
  }
}

interface AppWebViewProps {
  /** WebView 안에서 표시할 웹 페이지 path (예: '/calendar') */
  path: string
  /**
   * 데모(비로그인) 모드 — `/demo/calendar` 등 공개 라우트 전용.
   *   - `/demo` 밖 로그인·랜딩·OAuth 이탈 URL 을 가로채 onExitDemo 로 네이티브 복귀
   *   - soft-ask(푸시 권한) 억제 — 앱 시작 · deadline-saved 양쪽 (비로그인 권한 요청 부적절)
   *   - NativeHeader(탭 헤더)가 없으므로 상단 안전영역을 이 컴포넌트가 직접 처리
   */
  demo?: boolean
  /** 데모 이탈 감지 시 호출 — 네이티브 로그인 화면으로 복귀 (예: router.back()) */
  onExitDemo?: () => void
}

/** 회전 락 중재자에 이 웹뷰를 식별시키는 id (탭마다 인스턴스 1개 · logcat 추적용) */
let webViewSeq = 0

function buildFullUrl(path: string): string {
  // native mode flag 를 항상 붙임 · UA 감지 실패 시 폴백
  const separator = path.includes('?') ? '&' : '?'
  return `${WEB_URL}${path}${separator}native=1`
}

export function AppWebView({ path, demo = false, onExitDemo }: AppWebViewProps) {
  const theme = useThemeStore((s) => s.theme)
  const palette = getPalette(theme)
  const webViewRef = useRef<WebView>(null)
  const currentUrlRef = useRef<string | null>(null)
  // 🔴 회전 락 — 이 인스턴스의 식별자 + 로드 완료 여부 (주입 가드 · 아래 register effect 참조)
  const webViewIdRef = useRef<string>(`wv${++webViewSeq}:${path}`)
  const loadedRef = useRef(false)
  // 데모 이탈은 1회만 트리거 (onNavigationStateChange 다중 발화 · 중복 복귀 방지)
  const exitedRef = useRef(false)
  const exitDemo = useCallback(() => {
    if (exitedRef.current) return
    exitedRef.current = true
    onExitDemo?.()
  }, [onExitDemo])
  // ⑦ 알림 soft-ask 모달 (앱 시작 · 가치 순간 공용 · 쿨다운 통과 시)
  const [softAskVisible, setSoftAskVisible] = useState(false)

  /**
   * ⑦ 앱 시작 트리거 — 판정 기준을 **기기 진실**(OS 권한)로 둔다.
   * 웹 로그인 시점 모달은 서버 alarmPromptedAt==null 게이트라 기기 변경·재설치
   * 사용자에겐 영영 안 뜨고, 권한이 없으면 기기 등록이 스킵돼 Android 푸시가
   * 통째로 죽었다 (2026-08-13 실기 확정).
   *
   * 계약 (판정은 utils/softAsk 가 강제):
   *   [iOS] OS 팝업 평생 1회 → 소진 보호 우선
   *   - undetermined + 쿨다운 통과 : 앱 시작 · 가치 순간 중 먼저 온 쪽이 1회만
   *   - granted / denied(설정 끔 · OS 거부) : 조건 원천 미충족 → 절대 안 뜸
   *   [Android] expo 의 status 는 자체 캐시 기반이라 신뢰 불가 (softAsk.ts 상단 참조)
   *   - granted                    : 안 뜸
   *   - 그 외 전부(denied·undetermined) : 쿨다운 · 세션 가드 통과 시 노출
   *     → '알림 받기' 는 OS 팝업, 팝업이 다시 안 뜨는 기기면 설정 딥링크
   *       (handleSoftAskAllow)
   *   [공통]
   *   - '나중에'                   : 2주 쿨다운 (앵커는 응답이 아니라 **노출** 시점)
   *   - 세션 내                    : 경로 · 탭 인스턴스 불문 최대 1회
   *   - 데모                       : 미노출 (아래 조기 반환 + onMessage 가드)
   *   - AsyncStorage 실패          : shouldShow=false (fail-safe)
   *
   * 노출 직전 markSoftAskShown() 으로 세션 플래그 + 쿨다운 앵커를 동시에 찍어,
   * 모달을 무시한 채 탭을 옮겨도 다른 AppWebView 인스턴스가 다시 띄우지 못한다.
   */
  useEffect(() => {
    if (demo) return
    void shouldShowValueMomentSoftAsk().then((show) => {
      if (!show) return
      markSoftAskShown()
      setSoftAskVisible(true)
    })
  }, [demo])

  // ② 오프라인 감지 — 네트워크 미연결 또는 WebView 로드 에러(네트워크 계열)
  const netState = Network.useNetworkState()
  const [loadError, setLoadError] = useState(false)

  /**
   * ② 실측 override — **실측이 훅을 이긴다.**
   *
   * `Network.useNetworkState()` 는 마운트 때 건 구독 하나로만 값을 갱신한다
   * (expo-network/Network.js). 화면 잠금 20분+ 후 재개하면 이 구독이 죽은 채
   * `isConnected=false` 에 고착돼, 상태바 와이파이 정상 · 네이티브 배지 폴링 성공
   * (= 네트워크 실제 정상)인데도 오프라인 화면이 영구 표시되고 "다시 시도" 버튼도
   * 훅 값을 못 바꿔 무력했다 — 강제 종료 외 탈출 불가 (2026-08-13 실기 재현).
   * 그래서 `getNetworkStateAsync()` **실측** 결과를 훅 위에 얹는다.
   *
   *   null  = 미실측 · 또는 실측이 훅을 반박하지 않음 → 훅 값으로 판정 (평상시)
   *   true  = 실측 '연결됨' → 훅이 뭐라 하든 온라인 (고착 탈출)
   *
   * 실측이 '미연결' 이어도 false 로 박제하지 않고 null 로 **놓아준다**: 재개 직후
   * 무선 모뎀이 깨어나는 중이면 실측도 잠깐 미연결로 나올 수 있어, 그걸 박으면
   * 이번엔 반대 방향으로 오프라인 화면을 고착시킨다. 진짜 오프라인은 훅 값과
   * WebView 로드 에러(loadError)가 이미 잡으므로 override 로 단정할 이유가 없다.
   *
   * 훅이 값을 갱신하면(= 구독이 살아있다는 뜻) override 를 반납해 훅 우위를 복원한다.
   */
  const [probedOnline, setProbedOnline] = useState<boolean | null>(null)
  const online = probedOnline ?? netState.isConnected !== false
  const offline = !online || loadError

  // 훅이 값을 갱신했다 = 구독이 살아있다 → override 반납.
  // 덕분에 훅이 정상 발화하는 평상시 시나리오(기내모드 토글 등)는 동작 무변경.
  useEffect(() => {
    setProbedOnline(null)
  }, [netState.isConnected])

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

  // 오프라인 화면이 떠 있었는지 — 아래 AppState 리스너가 재구독 없이 읽는다
  const offlineRef = useRef(false)
  useEffect(() => {
    offlineRef.current = offline
  }, [offline])

  /**
   * ② 실측이 '연결됨' 일 때의 공통 복구 — 재개 리스너 · "다시 시도" 버튼 공용.
   * 오프라인 화면이 떠 있었을 때만 reload (평상시 재개마다 웹뷰 상태를 날리지 않기 위해).
   * wasOfflineRef 를 내려 두어, 훅이 뒤늦게 살아나도 위 자동 복귀가 같은 reload 를
   * 두 번 돌리지 않는다.
   */
  const recoverOnline = useCallback(() => {
    setProbedOnline(true)
    setLoadError(false)
    if (offlineRef.current) {
      wasOfflineRef.current = false
      webViewRef.current?.reload()
    }
  }, [])

  /**
   * ② 재개(foreground) 시 네트워크 **실측** — 훅 고착 자동 탈출 (수리 본체).
   *
   * 케이스 계약:
   *   - 재개 + 실제 온라인 + 훅 고착 → 여기서 자동 탈출 (사용자 개입 불필요)
   *   - 재개 + 실제 오프라인        → override 반납 · 오프라인 화면 유지 ·
   *                                   연결되면 위 wasOfflineRef 자동 복귀가 처리
   *   - 평상시 훅 정상              → 판정 결과가 훅과 동일 · 훅이 다시 발화하면 반납
   *   - 실측 API 실패              → 아무것도 안 바꿈 = 훅 값 폴백 (더 나빠지지 않기)
   *   - 탭 다중 인스턴스            → 각자 자기 웹뷰만 복구 (서로 무해)
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return
      void Network.getNetworkStateAsync()
        .then((state) => {
          // 미연결 실측은 단정하지 않고 훅·loadError 판정에 맡긴다 (위 주석 참조)
          if (state.isConnected === false) {
            setProbedOnline(null)
            return
          }
          recoverOnline()
        })
        .catch(() => {
          // 실측 실패 → 훅 값 폴백
        })
    })
    return () => sub.remove()
  }, [recoverOnline])

  // ② WebView 네트워크 로드 에러 → 오프라인 화면 (Safari 흰 에러 화면 노출 방지).
  // iOS NSURLError 중 네트워크 가용성 계열만 처리 (SSL·잘못된 URL·서버 응답 오류 제외).
  const onError = useCallback((e: WebViewErrorEvent) => {
    if (NETWORK_ERROR_CODES.has(e.nativeEvent.code)) {
      setLoadError(true)
    }
  }, [])

  /**
   * ② "다시 시도" — 실측 기반. 훅이 고착돼 있어도 실측이 '연결됨' 이면 여기서 탈출한다
   * (기존엔 loadError 만 지워서, 훅 고착 케이스에선 버튼이 판정을 못 바꿨다).
   * 미연결·실측 실패면 기존 동작 그대로 — 재로드 시도 후 실패하면 onError 가 다시
   * 오프라인 화면을 띄운다 (진짜 오프라인).
   */
  const handleOfflineRetry = useCallback(() => {
    const retryLoad = () => {
      setLoadError(false)
      webViewRef.current?.reload()
    }
    void Network.getNetworkStateAsync()
      .then((state) => {
        if (state.isConnected === false) {
          setProbedOnline(null)
          retryLoad()
          return
        }
        recoverOnline()
      })
      .catch(() => {
        retryLoad()
      })
  }, [recoverOnline])

  // iOS 네이티브 쿠키 저장소의 refresh_token 박제 제거 — 첫 로드가 끝났으면 웹뷰로의
  // 쿠키 시드가 이미 끝난 시점이라 지워도 안전하고, 이후 재마운트·reload 가 구세대
  // RT 를 웹뷰에 되씌우는 경로가 사라진다. Android 는 helper 내부에서 no-op.
  // (로그인 직후 세션도 같은 순서 — 로그인 → (tabs) 마운트 → 웹뷰 로드 → 여기)
  const rtCookieClearedRef = useRef(false)
  const onLoadEnd = useCallback(() => {
    loadedRef.current = true // 회전 락 주입 가드 (rtCookie 조기 반환보다 앞)
    if (rtCookieClearedRef.current) return
    rtCookieClearedRef.current = true
    void clearNativeRefreshTokenCookie()
  }, [])

  /**
   * 🔴 회전 락 중재자에 이 웹뷰 등록 (plan refresh-rotation-lock).
   *
   * 탭마다 웹뷰가 따로 있어 각자 refresh 를 회전시키다 같은 RT 를 동시에 소비했다.
   * 등록해 두면 ① 이 웹뷰의 락 요청에 grant 를 회신받고 ② 남이 회전에 성공했을 때
   * 새 access 방송을 받는다. 로드 전 주입은 웹 리스너가 없어 무의미하므로 건너뛴다
   * (방송 유실 = 웹 폴백으로 단독 회전 · 더 나빠지지 않음).
   */
  useEffect(() => {
    const id = webViewIdRef.current
    refreshLock.register(id, (js) => {
      if (!loadedRef.current) return
      webViewRef.current?.injectJavaScript(js)
    })
    return () => refreshLock.unregister(id)
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

  /**
   * target="_blank" 링크 (공고 URL 등) — iOS WKWebView 는 "새 창 요청" 경로로 가서
   * onShouldStartLoadWithRequest 를 타지 않는다. 핸들러가 없으면 클릭 무반응
   * (2026-07-20 CEO 실기 발견). 외부 도메인은 SFSafariVC, 내부는 현 웹뷰에서 이동.
   */
  const onOpenWindow = useCallback(
    (event: { nativeEvent: { targetUrl?: string } }) => {
      const targetUrl = event.nativeEvent?.targetUrl
      if (!targetUrl) return
      if (isChwippoDomain(targetUrl)) {
        webViewRef.current?.injectJavaScript(
          `window.location.href = ${JSON.stringify(targetUrl)}; true;`,
        )
      } else {
        void WebBrowser.openBrowserAsync(targetUrl).catch(() => {})
      }
    },
    [isChwippoDomain],
  )

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

      // 데모(비로그인) — 로그인·랜딩·OAuth 이탈은 웹뷰에서 열지 않고 네이티브 로그인 복귀.
      // isChwippoDomain 판정보다 먼저 (그렇지 않으면 '/auth/*' 가 그대로 로드됨).
      if (demo && isDemoAuthExit(url)) {
        exitDemo()
        return false
      }

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
    [isChwippoDomain, demo, exitDemo],
  )

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as
        | { type: 'theme'; theme: 'dark' | 'light' }
        | { type: 'token'; accessToken: string }
        | { type: 'logout' }
        | { type: 'account-deleted' }
        | { type: 'request-notification-permission' }
        | { type: 'open-notification-settings' }
        | { type: 'notifications-read' }
        | { type: 'deadline-saved' }
        | { type: 'get-app-lock' }
        | { type: 'set-app-lock'; enabled: boolean }
        | { type: 'refresh-lock-request'; reqId: string }
        | { type: 'refresh-lock-release'; reqId: string }
        | { type: string }

      if (msg.type === 'theme') {
        const t = (msg as { theme: 'dark' | 'light' }).theme
        if (t === 'dark' || t === 'light') {
          useThemeStore.getState().setTheme(t)
        }
        return
      }
      // 웹뷰 refresh 회전 성공 → 새 access 를 네이티브 SecureStore·메모리에 반영.
      // 네이티브 API(푸시 기기등록 · alarm-prompt · 종 배지)는 이 경로로만 최신 토큰을
      // 받는다 (네이티브 회전 제거 · client.ts 401 정책). 세션이 없으면 store 가 무시.
      if (msg.type === 'token') {
        const t = (msg as { accessToken?: unknown }).accessToken
        if (typeof t === 'string' && t) {
          useAuthStore.getState().setToken(t)
          // 🔴 회전 성공 = 락 해제 신호 겸용 — 새 access 를 전 웹뷰에 방송해
          // 대기 중인 다른 탭들이 HTTP 없이 해소되게 한다 (plan refresh-rotation-lock).
          refreshLock.handleTokenReceived(t)
        }
        return
      }
      // 🔴 회전 락 — 웹뷰가 회전 직전 요청, 선착순 1명만 grant (나머지는 방송으로 해소)
      if (msg.type === 'refresh-lock-request') {
        const reqId = (msg as { reqId?: unknown }).reqId
        if (typeof reqId === 'string' && reqId) {
          refreshLock.handleLockRequest(webViewIdRef.current, reqId)
        }
        return
      }
      // 🔴 회전 락 — 회전 실패 시 명시 해제 (성공은 위 token 이 겸용)
      if (msg.type === 'refresh-lock-release') {
        const reqId = (msg as { reqId?: unknown }).reqId
        if (typeof reqId === 'string' && reqId) {
          refreshLock.handleLockRelease(reqId)
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
      // ⑦ 마감일 저장(가치 순간) → 권한 게이트(iOS undetermined · Android !granted) +
      // 쿨다운(2주) 통과 시 soft-ask 노출.
      // OS 프롬프트는 승낙 시에만 (소진 방지). 기존 앱시작 동기화·설정 CTA 경로엔 영향 없음.
      // 앱 시작 트리거와 완전히 같은 패턴 — 세션 가드·쿨다운이 두 경로를 공통 차단한다.
      if (msg.type === 'deadline-saved') {
        // 데모(비로그인)에선 soft-ask 억제 — 권한 요청은 로그인 사용자 전용.
        // (프론트도 데모 모드에서 미발신 · 여기선 이중 방어)
        if (demo) return
        void shouldShowValueMomentSoftAsk().then((show) => {
          if (!show) return
          markSoftAskShown()
          setSoftAskVisible(true)
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
  }, [handleGetAppLock, handleSetAppLock, demo])

  const onNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    currentUrlRef.current = nav.url
    // 데모 SPA 이동(예: 배너 "둘러보기 종료" → '/') 감지 — iOS webview 의 history shim 이
    // pushState/replaceState/popstate 를 이 콜백으로 보고하므로 SPA 이탈도 잡힌다.
    // (full navigation 인 '/auth/*' OAuth 는 onShouldStartLoadWithRequest 가 먼저 가로챔)
    if (demo && isDemoAuthExit(nav.url)) exitDemo()
  }, [demo, exitDemo])

  /**
   * ⑦ soft-ask '알림 받기' — 로컬 앵커 갱신 + OS 권한 요청/등록 (승낙 시 서버도 동기화).
   *
   * Android 는 게이트가 `!granted` 라 **영구 거부 기기에도 모달이 뜬다.** 이때 OS 팝업은
   * 아예 안 떠서 요청만 하면 "눌러도 아무 일 없는" 막다른 길이 되므로, 그 경우
   * (osDialogBlocked — 판정 근거는 push.ts) 앱 알림 설정으로 보내 구제한다.
   * 사용자가 OS 팝업에서 직접 '거부'를 누른 케이스는 여기 해당 없음(설정으로 내쫓지 않음).
   *
   * 이 시점 status 는 확정적으로 'denied' 라 openNotificationSettingsOrRequest 는
   * 설정 딥링크로만 분기한다(재요청 경로 아님) — 기존 헬퍼 그대로 재사용.
   */
  const handleSoftAskAllow = useCallback(() => {
    setSoftAskVisible(false)
    void recordValueMomentPrompt()
    void requestPermissionAndRegister().then(({ osDialogBlocked }) => {
      if (osDialogBlocked) void openNotificationSettingsOrRequest()
    })
  }, [])

  // ⑦ soft-ask '나중에' — 로컬 쿨다운 앵커 + 서버 promptedAt 기록 (기존 계약 재사용)
  const handleSoftAskDismiss = useCallback(() => {
    setSoftAskVisible(false)
    void recordValueMomentPrompt()
    void syncAlarmPrompt(false).catch(() => {})
  }, [])

  return (
    // 탭 화면: top 은 NativeHeader(Tabs header), bottom 은 native tab bar 가 관리 → 중복 inset 방지(edges=[]).
    // 데모 화면: 탭·헤더가 없는 단일 스크린이라 상단 안전영역(노치·상태바)을 여기서 직접 처리.
    <SafeAreaView
      style={[styles.container, { backgroundColor: palette.bg }]}
      edges={demo ? ['top'] : []}
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
        onOpenWindow={onOpenWindow}
        onMessage={onMessage}
        onNavigationStateChange={onNavigationStateChange}
        // ② 네트워크 로드 에러 → 오프라인 화면 (Safari 흰 에러 화면 방지)
        onError={onError}
        // 첫 로드 완료 → iOS 네이티브 refresh_token 박제 제거 (위 주석 참조)
        onLoadEnd={onLoadEnd}
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
