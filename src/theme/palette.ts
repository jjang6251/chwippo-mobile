import type { Theme } from '@/stores/themeStore'

/**
 * 웹 palette 미러 (index.css `--bg` · `--surface` · `--brand` · `--line`).
 *
 * dark:  --bg #1a1816 · --surface #23211f · --text-primary #ebe9e3 등
 * light: --bg #f0eade · --surface #ffffff · --text-primary  등
 */

export interface Palette {
  bg: string
  surface: string
  textPrimary: string
  textTertiary: string
  textQuaternary: string
  line: string
  brand: string
  danger: string
  pressed: string
  statusBarStyle: 'light' | 'dark' // expo-status-bar prop
}

const DARK: Palette = {
  bg: '#1a1816',
  surface: '#23211f',
  textPrimary: '#ebe9e3',
  textTertiary: '#8a8780',
  textQuaternary: '#696760',
  line: 'rgba(255,255,255,0.08)',
  brand: '#6b9c7f',
  danger: '#f87171',
  pressed: 'rgba(255,255,255,0.04)',
  statusBarStyle: 'light',
}

const LIGHT: Palette = {
  bg: '#f0eade',
  surface: '#ffffff',
  textPrimary: '#1a1816',
  textTertiary: '#6e6a62',
  textQuaternary: '#8e8a82',
  line: 'rgba(26,24,22,0.10)',
  brand: '#4a8b6b',
  danger: '#dc2626',
  pressed: 'rgba(0,0,0,0.04)',
  statusBarStyle: 'dark',
}

export function getPalette(theme: Theme): Palette {
  return theme === 'light' ? LIGHT : DARK
}
