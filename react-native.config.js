/**
 * React Native autolinking 오버라이드.
 *
 * @react-native-cookies/cookies — **iOS 전용으로만 링크**한다.
 *   1) 용도가 iOS 전용이다. NSHTTPCookieStorage 에 박제된 refresh_token 삭제
 *      (src/utils/cookies.ts). Android 는 네이티브·웹뷰가 CookieManager 를 공유해
 *      지우면 웹뷰까지 지워지므로 애초에 호출하면 안 된다.
 *   2) 이 패키지의 android/build.gradle 이 AGP 3.x 시절 그대로다 (namespace 없음,
 *      jcenter, `com.facebook.react:react-native:+`). 링크되면 현재 AGP 8 빌드가 깨진다.
 */
module.exports = {
  dependencies: {
    '@react-native-cookies/cookies': {
      platforms: {
        android: null,
      },
    },
  },
}
