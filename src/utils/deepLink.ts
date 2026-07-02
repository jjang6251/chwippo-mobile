import * as Linking from 'expo-linking'
import { router } from 'expo-router'

/**
 * Deep link handler — chwippo://* scheme parsing.
 *
 * Sources:
 *  - Share Extension (W5) — `chwippo://board/quick-add?url=...`
 *  - Push notification click (W3) — `chwippo://board/:appId`
 *  - Universal Links (W5) — `https://chwippo.com/*` → app
 *
 * W2 shell · 기본 setup 만 · 실 라우팅은 W3 이후.
 */

export function parseDeepLink(url: string): { path: string; params: Record<string, string> } | null {
  try {
    const parsed = Linking.parse(url)
    if (!parsed.path) return null
    return {
      path: parsed.path,
      params: (parsed.queryParams as Record<string, string>) ?? {},
    }
  } catch {
    return null
  }
}

export function handleDeepLink(url: string): void {
  const parsed = parseDeepLink(url)
  if (!parsed) return

  // W2 placeholder — 실제 라우팅 로직은 W3 · Share Extension 은 W5
  const target = `/${parsed.path}`
  router.push(target as never)
}
