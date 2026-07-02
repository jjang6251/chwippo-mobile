# chwippo-mobile

취뽀 (Chwippo) React Native + Expo 하이브리드 모바일 앱

- **iOS + Android 동시 출시** 목표 D-day: **2026-08-14**
- Expo SDK 54 (managed → prebuild custom dev client)
- 네이티브 화면 + WebView 통합 (Web 코드 재사용)
- 카카오 native SDK 로그인 + Sign in with Apple (iOS)
- iOS WidgetKit (D-day 위젯) · Share Extension (공고 URL 추가)
- 백엔드: [`chwippo-back`](https://github.com/jjang6251/chwippo-back) (기존)
- 웹: [`chwippo-front`](https://github.com/jjang6251/chwippo-front) (WebView 화면 재사용)

> **Plan**: `~/.claude/plans/rn-hybrid-v2-storeready.md`
> **심사 통과 확률 목표**: 75-85% 한 번에 통과

---

## 로컬 셋업

```bash
# 1. 의존성 설치
npm install

# 2. 환경 변수 설정
cp .env.example .env
# .env 편집 · KAKAO_NATIVE_APP_KEY 등 값 채움

# 3. Expo prebuild (native 프로젝트 생성 · W2 진입 시)
npx expo prebuild --clean

# 4. 개발 서버 시작
npm run start

# 5. 실기 빌드 (EAS · Apple/Google Developer Program 필수)
eas build --profile development --platform ios
eas build --profile development --platform android
```

---

## 심사 리스크 대응 요약

### iOS (App Store)
- ✅ Sign in with Apple (Guideline 4.8 · `expo-apple-authentication`)
- ✅ Privacy Manifest 4 카테고리 선언 (`app.config.ts`)
- ✅ Face ID / Touch ID (`expo-local-authentication` · Guideline 4.2 방어)
- ✅ Native offline mode (`expo-network` · Guideline 4.2 방어)
- ✅ SFSafariViewController for 외부 링크 (`expo-web-browser`)
- ✅ AI Provider Disclosure Consent Modal (Guideline 5.1.2(i) · 2025/11 신설)
- ✅ In-app 계정 삭제 (Guideline 5.1.1(v))
- ✅ ATT framework 미링크 (`NSUserTrackingUsageDescription` 없음)
- ✅ iOS Widget (WidgetKit · `@bacons/apple-targets` · 실데이터 D-day)

### Android (Google Play)
- ✅ Target SDK 35 (Android 15 · 2025/8/31~ 필수)
- ✅ Kakao Android 5+ keyhash 등록 필요 (debug · upload · Play App Signing)
- ✅ Data Safety Form 정확 매핑
- ✅ AI Content Policy 신고 버튼
- ✅ 한국 개인정보처리방침 v2 (Anthropic 위탁 · 국외 이전 명시)
- ⚠️ **Organization 계정 필수** (Personal 은 12테스터×14일 강제)
- ✅ Sensitive permission blocked (`ACCESS_BACKGROUND_LOCATION` 등)

---

## Bundle IDs

| 대상 | ID |
|---|---|
| Main app | `com.chwippo.app` |
| iOS Widget | `com.chwippo.app.widget` |
| iOS Share Extension | `com.chwippo.app.share` |
| App Group (data 공유) | `group.com.chwippo.app` |

---

## 6주 timeline (D-day 2026-08-14)

| Week | 기간 | 주요 작업 |
|---|---|---|
| W1 | 7/2 ~ 7/8 | 계정 · 인프라 · Kakao 콘솔 · Bundle IDs |
| W2 | 7/9 ~ 7/15 | Expo prebuild · Config plugins · 첫 build · SIWA 백엔드 |
| W3 | 7/16 ~ 7/22 | SIWA · 계정 삭제 · Face ID · Offline mode |
| W4 | 7/23 ~ 7/29 | WebView 통합 · AI consent · 위젯 |
| W5 | 7/30 ~ 8/5 | Share Extension · Privacy · Metadata |
| W6 | 8/6 ~ 8/12 | QA · 베타 · Submit |
| W7 | 8/13 ~ 8/14 | 심사 대응 buffer |

**W3 middle-check (7/22)**: 진도 지연 시 W5 축소 결정.

---

## 주요 명령어

```bash
# 개발
npm run start                    # Expo dev server
npm run ios                      # iOS 시뮬레이터
npm run android                  # Android 에뮬레이터

# 타입 검사 · lint
npm run typecheck
npm run lint

# Prebuild (native 프로젝트 생성)
npm run prebuild                 # iOS + Android
npm run prebuild:ios
npm run prebuild:android

# EAS Build
eas build --profile development --platform ios
eas build --profile production --platform all

# EAS Submit (첫 제출은 수동 필수 · Google Play 정책)
eas submit --profile production --platform ios
```

---

## 폴더 구조 (예정)

```
chwippo-mobile/
├── app/                          # Expo Router (파일 기반 라우팅)
│   ├── _layout.tsx               # Root layout · auth guard · biometric
│   ├── login.tsx                 # Kakao + SIWA 병행
│   ├── (tabs)/                   # 네이티브 tab bar
│   │   ├── _layout.tsx
│   │   ├── index.tsx             # 홈 (D-day list · 위젯 source)
│   │   ├── notifications.tsx     # 인앱 알림 센터
│   │   └── settings.tsx          # Face ID · 계정 삭제
│   └── webview/
│       └── [...slug].tsx         # WebView 7 화면 통합
├── src/
│   ├── api/                      # axios + JWT
│   ├── components/
│   │   ├── KakaoLoginButton.tsx
│   │   ├── AppleLoginButton.tsx
│   │   ├── AiConsentModal.tsx
│   │   ├── AiReportButton.tsx
│   │   ├── OfflineFallback.tsx
│   │   └── ChwippoWebView.tsx
│   ├── stores/                   # Zustand
│   ├── utils/
│   │   ├── datetime.ts
│   │   ├── deepLink.ts
│   │   └── biometric.ts
│   └── push/
│       ├── registerDevice.ts
│       └── handleNotification.ts
├── targets/                      # @bacons/apple-targets (W4)
│   ├── widget/
│   └── share/
├── assets/                       # 아이콘 · 스플래시
├── app.config.ts                 # Expo config (dynamic)
├── eas.json                      # EAS Build
├── tsconfig.json
├── .env.example
└── package.json
```

---

## 참고 문서

- Plan: `~/.claude/plans/rn-hybrid-v2-storeready.md`
- 백엔드: `~/Desktop/chwippo/chwippo-back`
- 웹 (참조): `~/Desktop/chwippo/chwippo-front`
- 프로젝트 전체 CLAUDE.md: `~/Desktop/chwippo/CLAUDE.md`
