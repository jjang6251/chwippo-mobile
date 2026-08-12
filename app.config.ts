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
    name: '치뽀',
    slug: 'chwippo-mobile',
    // 0.1.0 은 App Store 승인으로 트랙 마감 (Apple 90186) — 새 빌드는 버전 상향 필수
    version: '0.1.1',
    orientation: 'portrait',
    scheme: 'chwippo',
    userInterfaceStyle: 'automatic',

    // App icon · splash · E2안 실디자인 (2026-07-10 확정 — ㅊ 모노그램 + 새싹 잎 + coral 열매. 원본: assets/*-source.svg)
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#1a1816',
    },

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
        // App Store 제품 페이지 "언어" 표기 — 미선언 시 Expo 기본값(영어)이 바이너리에
        // 박혀 한국 스토어에 "언어: 영어"로 노출된다 (0.1.1 빌드 14까지의 상태)
        CFBundleDevelopmentRegion: 'ko',
        CFBundleLocalizations: ['ko'],

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
        'com.apple.developer.applesignin': ['Default'],
      },
    },

    // === Android ===
    android: {
      package: 'com.chwippo.app',

      /*
        FCM (Android 푸시) — Expo Push Service 가 FCM V1 로 발송하려면 이 파일 + EAS 에
        업로드된 Firebase 서비스 계정 키가 필요하다. 공개 레포라 git 커밋은 차단하되
        (.gitignore) **.easignore 로 EAS 업로드 아카이브에는 포함**시킨다 — env file var
        주입은 environment 연결로도 동작하지 않아 vc3~vc5 가 FCM 없는 바이너리로 나갔다
        (2026-08-12 실사고 · aab 압축 해제 grep 실측). env fallback 은 남겨둔다.
      */
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',

      // Adaptive icon · brand 배경 + 워드마크 foreground
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#1a1816', // E2 다크 통일 (iOS 아이콘과 동일 배경)
      },

      // 알림 관련
      permissions: ['NOTIFICATIONS', 'INTERNET', 'ACCESS_NETWORK_STATE'],

      // ⚠️ 아래 permission 절대 자동 추가되지 않도록 감시
      // - QUERY_ALL_PACKAGES · REQUEST_INSTALL_PACKAGES · ACCESS_BACKGROUND_LOCATION
      // - READ_MEDIA_IMAGES · READ_MEDIA_VIDEO (Photo Picker 만 사용)
      // - SYSTEM_ALERT_WINDOW · MANAGE_EXTERNAL_STORAGE
      blockedPermissions: [
        // Play Console "광고 ID 사용 안 함" 선언과 매니페스트 정합 보장 — 전이 의존성이
        // 넣어도 제거 (어긋나면 aab 업로드 거부)
        'com.google.android.gms.permission.AD_ID',
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

      // Sign in with Apple
      'expo-apple-authentication',

      // Push notifications
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#ffffff',
        },
      ],

      // Local biometric (Face ID / Touch ID)
      'expo-local-authentication',

      /*
        🔴 증빙 파일 촬영·첨부용 — 동영상은 안 쓰므로 마이크 권한을 **제거**한다.
        플러그인 기본값이 NSMicrophoneUsageDescription 에 영어 플레이스홀더를 주입해
        0.1.1 심사 거절 (2026-08-12, "placeholder text" 자동 분석). 카메라·앨범 문구는
        위 infoPlist 의 한국어 문구가 최종 승자지만 명시적으로 통일해 둔다.
      */
      [
        'expo-image-picker',
        {
          cameraPermission: '자격증 · 상장 등 증빙 파일을 촬영하기 위해 카메라를 사용합니다.',
          photosPermission: '자격증 · 상장 · 자소서 등 파일 첨부를 위해 사진 앨범에 접근합니다.',
          microphonePermission: false,
        },
      ],

      // Widget + Share Extension targets (별도 targets/ 폴더에 config 파일 생성)
      // W4 에 활성화 · 지금은 주석 처리
      // '@bacons/apple-targets',
    ],

    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://api.chwippo.com',
      webUrl: process.env.EXPO_PUBLIC_WEB_URL ?? 'https://chwippo.com',
      // W3 인증 · runtime 에서 Kakao SDK 초기화 시 필요
      kakaoNativeAppKey: KAKAO_NATIVE_APP_KEY,
      // EAS 프로젝트 (2026-07-11 eas init) · getExpoPushTokenAsync 의 projectId 소스
      eas: {
        projectId: 'f4f64fc8-ffec-46c5-b2e1-8657011680d1',
      },
    },

    experiments: {
      typedRoutes: true,
    },
  }
}
