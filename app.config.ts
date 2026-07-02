import type { ExpoConfig, ConfigContext } from '@expo/config'

/**
 * chwippo-mobile Expo config (dynamic · env 기반)
 *
 * 심사 리스크 반영 config (v2 storeready plan):
 * - iOS 26 SDK · Xcode 16 대응
 * - Android targetSdk 35 (Android 15)
 * - Privacy Manifest 4 카테고리 선언
 * - Kakao native SDK Info.plist + AndroidManifest
 * - Sign in with Apple entitlement
 * - Face ID / Touch ID 지원
 * - App Group (widget · share extension 공유)
 * - Photo Picker only (READ_MEDIA_IMAGES 미선언)
 * - ATT framework 미링크 (NSUserTrackingUsageDescription 없음)
 *
 * 사용:
 *   `.env` 에 KAKAO_NATIVE_APP_KEY 등 설정
 *   `npx expo prebuild --clean` 실행 시 이 config 로 native 프로젝트 생성
 */

export default ({ config }: ConfigContext): ExpoConfig => {
  const KAKAO_NATIVE_APP_KEY = process.env.KAKAO_NATIVE_APP_KEY ?? ''

  if (!KAKAO_NATIVE_APP_KEY) {
    console.warn('[app.config.ts] KAKAO_NATIVE_APP_KEY 환경변수 미설정 · Kakao login 동작 안 함')
  }

  return {
    ...config,
    name: 'chwippo',
    slug: 'chwippo-mobile',
    version: '0.1.0',
    orientation: 'portrait',
    scheme: 'chwippo',
    userInterfaceStyle: 'automatic',

    // === iOS ===
    ios: {
      bundleIdentifier: 'com.chwippo.app',
      supportsTablet: false,
      appleTeamId: process.env.APPLE_TEAM_ID ?? undefined,

      // Guideline 5.1.1 Privacy Manifest (ITMS-91061 강제 · 2025/2/12~)
      // Expo static CocoaPods 파싱 이슈로 app level 재선언 필수
      privacyManifests: {
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
            NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
          },
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
            NSPrivacyAccessedAPITypeReasons: ['C617.1'],
          },
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
            NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
          },
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
            NSPrivacyAccessedAPITypeReasons: ['E174.1'],
          },
        ],
        NSPrivacyTracking: false,
      },

      infoPlist: {
        // Kakao Login
        LSApplicationQueriesSchemes: ['kakaokompassauth', 'kakaolink', 'kakaoplus'],
        CFBundleURLTypes: [
          {
            CFBundleTypeRole: 'Editor',
            CFBundleURLSchemes: [`kakao${KAKAO_NATIVE_APP_KEY}`, 'chwippo'],
          },
        ],
        KAKAO_APP_KEY: KAKAO_NATIVE_APP_KEY,

        // Purpose strings (RN transitive deps 참조 대비 · ITMS-90683 방지)
        NSCameraUsageDescription: '자격증 · 상장 등 증빙 파일을 촬영하기 위해 카메라를 사용합니다.',
        NSPhotoLibraryUsageDescription:
          '자격증 · 상장 · 자소서 등 파일 첨부를 위해 사진 앨범에 접근합니다.',
        NSPhotoLibraryAddUsageDescription: '이미지 저장을 위해 사진 앨범에 접근합니다.',
        NSFaceIDUsageDescription: '앱 잠금 해제를 위해 Face ID 를 사용합니다.',
        NSUserNotificationsUsageDescription: 'D-day · 마감 리마인더 알림을 보내드립니다.',

        // Export compliance (HTTPS only · 자동 답변)
        ITSAppUsesNonExemptEncryption: false,

        // App Transport Security (HTTPS 필수 · 예외 없음)
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
        },

        // ⚠️ NSUserTrackingUsageDescription 절대 넣지 말 것 (ATT framework 미링크 유지)
        // 광고 SDK · IDFA · cross-app tracking 없음
      },

      // App Group (widget + share extension 데이터 공유)
      entitlements: {
        'com.apple.security.application-groups': ['group.com.chwippo.app'],
        // Apple Developer 유료 계정 활성화 후 복구:
        // 'com.apple.developer.applesignin': ['Default'],
      },
    },

    // === Android ===
    android: {
      package: 'com.chwippo.app',

      // 알림 관련
      permissions: ['NOTIFICATIONS', 'INTERNET', 'ACCESS_NETWORK_STATE'],

      // ⚠️ 아래 permission 절대 자동 추가되지 않도록 감시
      // - QUERY_ALL_PACKAGES · REQUEST_INSTALL_PACKAGES · ACCESS_BACKGROUND_LOCATION
      // - READ_MEDIA_IMAGES · READ_MEDIA_VIDEO (Photo Picker 만 사용)
      // - SYSTEM_ALERT_WINDOW · MANAGE_EXTERNAL_STORAGE
      blockedPermissions: [
        'android.permission.QUERY_ALL_PACKAGES',
        'android.permission.REQUEST_INSTALL_PACKAGES',
        'android.permission.ACCESS_BACKGROUND_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.MANAGE_EXTERNAL_STORAGE',
      ],
    },

    // === Plugins ===
    plugins: [
      'expo-router',

      // Android targetSdk 35 · iOS deployment target 15.1
      [
        'expo-build-properties',
        {
          android: {
            targetSdkVersion: 35,
            compileSdkVersion: 35,
            minSdkVersion: 24,
            usesCleartextTraffic: false,
            extraMavenRepos: ['https://devrepo.kakao.com/nexus/content/groups/public/'],
          },
          ios: {
            deploymentTarget: '15.1',
          },
        },
      ],

      // Kakao Native SDK
      [
        '@react-native-kakao/core',
        {
          nativeAppKey: KAKAO_NATIVE_APP_KEY,
          android: {
            authCodeHandlerActivity: true,
          },
          ios: {
            handleKakaoOpenUrl: true,
          },
        },
      ],

      // Sign in with Apple · Personal Team 미지원 · Apple Developer 유료 후 복구
      // 'expo-apple-authentication',

      // Push notifications · Personal Team 미지원 · Apple Developer 유료 후 복구
      // [
      //   'expo-notifications',
      //   {
      //     icon: './assets/notification-icon.png',
      //     color: '#ffffff',
      //   },
      // ],

      // Local biometric (Face ID / Touch ID)
      'expo-local-authentication',

      // Widget + Share Extension targets (별도 targets/ 폴더에 config 파일 생성)
      // W4 에 활성화 · 지금은 주석 처리
      // '@bacons/apple-targets',
    ],

    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://api.chwippo.com',
      webUrl: process.env.EXPO_PUBLIC_WEB_URL ?? 'https://chwippo.com',
      // W3 인증 · runtime 에서 Kakao SDK 초기화 시 필요
      kakaoNativeAppKey: KAKAO_NATIVE_APP_KEY,
    },

    experiments: {
      typedRoutes: true,
    },
  }
}
