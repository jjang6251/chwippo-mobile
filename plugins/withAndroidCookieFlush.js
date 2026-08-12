/**
 * withAndroidCookieFlush — Android refresh token 유실 창 봉인 (config plugin)
 *
 * ## 왜
 * refresh token 회전은 웹뷰가 전담하고(ADR-080) RT 는 웹뷰 쿠키에 산다.
 * 그런데 **Android WebView 의 쿠키 디스크 반영(flush)은 주기적**이라, 회전 직후
 * (= 새 RT 가 아직 메모리에만 있는 상태에서) 앱이 종료되면 새 RT 가 유실된다.
 * 다음 콜드스타트는 묵은 RT 를 제출 → 서버가 재사용으로 감지 → 체인 revoke →
 * 사용자는 이유 없이 로그아웃된다.
 *
 * iOS 는 같은 증상의 원인이 `syncCookiesToWebView` 덮어쓰기였고 이미 수리됐다.
 * 이 플러그인은 그 **Android 대칭 축**으로, MainActivity 의 `onPause()` 에서
 * 쿠키를 디스크로 강제 반영해 "회전 직후 종료" 창을 봉인한다.
 * (`onPause` 는 홈 버튼 · 앱 스위처 · 종료 직전에 반드시 호출된다)
 *
 * ## 어떻게
 * `android.webkit.CookieManager` 를 **풀패키지 경로로 인라인 호출**한다.
 * import 문을 건드릴 필요가 없어 주입이 한 곳(클래스 본문)으로 끝난다.
 *
 * ## 멱등
 * `MARKER` 주석 유무로 이미 주입됐는지 검사한다. `expo prebuild` 를 `--clean`
 * 없이 반복 실행해도 중복 주입되지 않는다.
 *
 * ## 검증
 *   npx expo prebuild --platform android --no-install
 *   grep -n -A4 "CookieManager" android/app/src/main/java/com/chwippo/app/MainActivity.kt
 *   npx expo prebuild --platform android --no-install   # 한 번 더 (--clean 없이)
 *   grep -c "CookieManager" android/app/src/main/java/com/chwippo/app/MainActivity.kt  # 1
 */

const { withMainActivity } = require('@expo/config-plugins')

const MARKER = 'chwippo:android-cookie-flush'

const SNIPPET = `
  // ${MARKER} (withAndroidCookieFlush config plugin 이 주입 · 직접 수정 금지)
  override fun onPause() {
    super.onPause()
    // RT 회전 직후 앱 종료 시 웹뷰 쿠키(refresh token) 유실 방지 — 디스크 강제 반영
    try { android.webkit.CookieManager.getInstance().flush() } catch (_: Exception) {}
  }
`

module.exports = function withAndroidCookieFlush(config) {
  return withMainActivity(config, (cfg) => {
    const { language, contents } = cfg.modResults

    // 조용한 no-op 은 버그를 그대로 출고시킨다 → 전제가 깨지면 prebuild 를 실패시킨다.
    if (language !== 'kt') {
      throw new Error(
        `[withAndroidCookieFlush] MainActivity 가 Kotlin 이 아님 (language=${language}). ` +
          'Java 템플릿용 주입 코드를 추가해야 한다.'
      )
    }

    // 멱등 — 이미 주입돼 있으면 그대로 둔다
    if (contents.includes(MARKER)) {
      return cfg
    }

    // 클래스 본문 마지막(= 파일의 마지막 닫는 브레이스) 앞에 주입한다.
    // 기존 메서드들 뒤라 순서 의존이 없고, 템플릿이 메서드를 추가·삭제해도 견딘다.
    const anchor = contents.lastIndexOf('}')
    if (anchor === -1 || !/class\s+MainActivity\b/.test(contents)) {
      throw new Error(
        '[withAndroidCookieFlush] MainActivity 클래스 닫는 브레이스를 찾지 못했다. ' +
          'Expo 템플릿이 바뀌었는지 확인할 것.'
      )
    }

    cfg.modResults.contents = contents.slice(0, anchor) + SNIPPET + contents.slice(anchor)

    return cfg
  })
}
