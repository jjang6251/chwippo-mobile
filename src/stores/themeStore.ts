import { create } from 'zustand'
import { Appearance } from 'react-native'

/**
 * Theme 상태 · dark/light.
 *
 * 초기값 = iOS 시스템 설정 (Appearance.getColorScheme).
 * 이후 웹 WebView 가 postMessage 로 사용자 선택 (dark/light/system→resolved) 전달 시 덮어씀.
 * 시스템 다크/라이트 변경도 실시간 반영 (사용자가 웹에서 명시적으로 dark/light 안 골랐을 때만).
 */

export type Theme = 'dark' | 'light'

function systemTheme(): Theme {
  return Appearance.getColorScheme() === 'light' ? 'light' : 'dark'
}

interface ThemeState {
  theme: Theme
  /** 웹이 명시적으로 dark/light 선택 · true 면 시스템 변경 무시 */
  overriddenByWeb: boolean
  setTheme: (t: Theme) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: systemTheme(),
  overriddenByWeb: false,
  setTheme: (theme) => set({ theme, overriddenByWeb: true }),
}))

// iOS 시스템 다크/라이트 변경 실시간 감지
Appearance.addChangeListener(({ colorScheme }) => {
  const state = useThemeStore.getState()
  if (state.overriddenByWeb) return // 웹에서 명시 선택 시 시스템 무시
  const next: Theme = colorScheme === 'light' ? 'light' : 'dark'
  if (state.theme !== next) {
    useThemeStore.setState({ theme: next })
  }
})
