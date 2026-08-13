/**
 * 웹뷰 refresh 회전 락 중재자 (plan refresh-rotation-lock · 모듈 싱글턴).
 *
 * 하단 탭마다 AppWebView 인스턴스가 1개씩(최대 5) 상주하는데, 각 웹뷰는 독립 JS 세계라
 * 웹의 `performRefresh` single-flight 큐도 각자 소유한다. access 만료 후 잠금·백그라운드에서
 * 복귀하면 N개가 **같은 refresh_token 쿠키로 동시에 회전**해 429(요청 폭주)나
 * 재사용 감지 → 체인 revoke → 강제 로그아웃이 났다 (ADR-080 "회전 주체 1개"가 탭 구조
 * 안에서 다시 깨진 것).
 *
 * 회전 실행은 그대로 웹뷰(RT 소유자)가 하고 **순서만 여기서 중재**한다:
 *   - `refresh-lock-request` → holder 가 없으면 즉시 grant(요청한 웹뷰에만 주입)
 *   - holder 가 있으면 큐 대기 — grant 을 보내지 않는다 (승자의 방송이 해소한다)
 *   - `token`(회전 성공) → holder 해제 + **전 웹뷰에 token-broadcast** + 큐 비움
 *   - `refresh-lock-release`(회전 실패) → holder 해제 + 큐 첫 대기자에 grant 승계
 *   - holder 5s 타임아웃 → 웹뷰가 죽어도(파괴·크래시) 락이 영구히 묶이지 않는다
 *
 * 웹은 무응답 700ms 에 단독 회전으로 폴백하므로, 이 모듈이 통째로 실패해도
 * 동작은 수리 전과 같다 (새 오류를 만들지 않는다).
 *
 * 계측 로그: 실기(logcat)에서 "재개 시 락 요청 N건 → HTTP 회전 1건"을 확인하는 유일한
 * 증거다. 프로덕션 웹 번들은 console 이 제거돼 있어 웹 쪽에선 셀 수 없다.
 */

/** 웹뷰 하나에 JS 를 주입하는 함수 (AppWebView 의 injectJavaScript 래퍼) */
type InjectFn = (js: string) => void

interface LockEntry {
  webviewId: string
  reqId: string
}

/** holder 가 죽었을 때 락을 되찾기까지의 상한 (웹 대기 상한 8s 보다 짧게) */
const HOLDER_TIMEOUT_MS = 5000

const webviews = new Map<string, InjectFn>()
const queue: LockEntry[] = []
let holder: LockEntry | null = null
let holderTimer: ReturnType<typeof setTimeout> | null = null

function log(message: string): void {
  console.log(`[refreshLock] ${message}`)
}

function injectEvent(webviewId: string, name: string, detail: object): void {
  const inject = webviews.get(webviewId)
  if (!inject) return
  inject(`
    try {
      window.dispatchEvent(new CustomEvent(${JSON.stringify(name)}, { detail: ${JSON.stringify(detail)} }));
    } catch (_) {}
    true;
  `)
}

function clearHolderTimer(): void {
  if (holderTimer) {
    clearTimeout(holderTimer)
    holderTimer = null
  }
}

function grant(entry: LockEntry): void {
  holder = entry
  clearHolderTimer()
  holderTimer = setTimeout(() => {
    log(`holder timeout 5s (${entry.webviewId}) → 자동 해제`)
    holder = null
    holderTimer = null
    promoteNext()
  }, HOLDER_TIMEOUT_MS)
  injectEvent(entry.webviewId, 'chwippo:refresh-lock-grant', { reqId: entry.reqId })
  log(`grant → ${entry.webviewId} (대기 ${queue.length})`)
}

/** holder 가 비어 있을 때 큐 첫 대기자에게 락을 승계 */
function promoteNext(): void {
  const next = queue.shift()
  if (!next) return
  grant(next)
}

/** 웹뷰 마운트 — 방송 대상에 등록. 데모 웹뷰도 등록 무해 (회전 자체를 안 한다). */
export function register(webviewId: string, inject: InjectFn): void {
  webviews.set(webviewId, inject)
  log(`register ${webviewId} (총 ${webviews.size})`)
}

/** 웹뷰 언마운트 — 방송 대상에서 빼고 자기 pending(대기·보유) 정리 */
export function unregister(webviewId: string): void {
  webviews.delete(webviewId)
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i]?.webviewId === webviewId) queue.splice(i, 1)
  }
  if (holder?.webviewId === webviewId) {
    log(`unregister ${webviewId} — holder 였음 → 승계`)
    holder = null
    clearHolderTimer()
    promoteNext()
  }
  log(`unregister ${webviewId} (총 ${webviews.size})`)
}

/** 웹 → 회전 직전 락 요청. 선착순 1명만 grant, 나머지는 조용히 큐 대기. */
export function handleLockRequest(webviewId: string, reqId: string): void {
  if (holder) {
    queue.push({ webviewId, reqId })
    /*
      "큐에 넣었다"를 반드시 회신한다 — 없으면 웹은 '대기 중'과 '락 관리자 없는 구앱'을
      구분할 수 없어 무응답 폴백(700ms)을 그대로 태우고, 승자의 회전이 700ms 만 넘겨도
      대기자 전원이 단독 회전으로 흩어져 수리가 무력화된다. 이 회신을 받은 웹은 폴백을
      걷고 상한(8s)까지 승자의 방송·승계 grant 를 기다린다.
    */
    injectEvent(webviewId, 'chwippo:refresh-lock-queued', { reqId })
    log(`queue ${webviewId} (holder=${holder.webviewId} · 대기 ${queue.length})`)
    return
  }
  grant({ webviewId, reqId })
}

/**
 * 웹 → 회전 성공(`token`). holder 해제 + 전 웹뷰에 새 access 방송 + 큐 비움.
 * 대기자들은 이 방송으로 HTTP 없이 해소되므로 승계 grant 를 보내지 않는다.
 */
export function handleTokenReceived(accessToken: string): void {
  const waiters = queue.length
  holder = null
  clearHolderTimer()
  queue.length = 0
  for (const webviewId of webviews.keys()) {
    injectEvent(webviewId, 'chwippo:token-broadcast', { accessToken })
  }
  log(`broadcast → 웹뷰 ${webviews.size} (해소된 대기 ${waiters})`)
}

/** 웹 → 회전 실패. 락을 해제하고 큐 첫 대기자에게 승계한다. */
export function handleLockRelease(reqId: string): void {
  if (holder?.reqId !== reqId) {
    /*
      holder 가 아닌 release — 웹이 700ms 폴백으로 단독 회전했다가 실패한 대기자의 것이다.
      큐에서도 지운다. 안 지우면 나중에 이 죽은 reqId 로 승계 grant 이 가고(웹은 reqId
      불일치로 무시) 락이 holder 타임아웃 5s 까지 통째로 묶인다.
    */
    const i = queue.findIndex((e) => e.reqId === reqId)
    if (i >= 0) queue.splice(i, 1)
    log(`release 무시 (${reqId} · 현 holder 아님 · 큐 정리 ${i >= 0 ? 1 : 0})`)
    return
  }
  log(`release ${holder.webviewId} → 승계 (대기 ${queue.length})`)
  holder = null
  clearHolderTimer()
  promoteNext()
}
