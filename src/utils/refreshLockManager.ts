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
 *   - `refresh-lock-request` → **화면에 보이는(활성) 웹뷰**면 즉시 grant, 아니면 큐 대기
 *   - holder 가 있으면 큐 대기 — grant 을 보내지 않는다 (승자의 방송이 해소한다)
 *   - `setActive`(탭 focus/blur) → holder 가 비활성이 되면 회수 + 활성 대기자에 승계
 *   - `token`(회전 성공) → holder 해제 + **전 웹뷰에 token-broadcast** + 큐 비움
 *   - `refresh-lock-release`(회전 실패) → holder 해제 + 큐의 **활성** 대기자에 grant 승계
 *   - holder 30s 타임아웃 → 웹뷰가 죽어도(파괴·크래시·찰나의 이탈) 락이 영구히 묶이지 않는다
 *
 * 🔴 **얼어붙을 수 있는 주체에게 락을 주지 않는다** (2026-08-14 vc15 4회차 실기 확정).
 * Android WebView 는 화면에서 사라지면 그 안의 JS 타이머를 **정지**시킨다. 재개 직후 탭을
 * 넘겨 락을 쥔 웹뷰가 뒤로 밀리면, 그 웹뷰는 회전을 끝낼 수도 자기 abort 타이머(8s)로
 * 스스로 물러날 수도 없다 — 실측에서 배경으로 밀린 wv5 는 `http:start` 뒤 영영 침묵했고,
 * 같은 순간 화면에 있던 wv17 의 35s 타이머는 2ms 오차로 정확히 울렸다. 그동안 전 탭의
 * 세션 복구가 holder 타임아웃 30s 까지 통째로 멈춘다. 탭을 옮기지 않은 사이클은 0.5~1s 에
 * 정상 완료됐다(반대 근거).
 * 웹은 이 상황을 스스로 감지할 수 없다 — 뒤로 밀리는 웹뷰엔 아무 신호도 오지 않는다
 * (`page:hide` 조차 새로 앞에 오는 쪽만 찍는다). 어느 탭이 활성인지 아는 것은 네이티브뿐이라
 * 판정을 여기에 둔다 (보고는 AppWebView 의 useFocusEffect → setActive).
 *
 * ## 상태 전이 표 — 이 레포엔 테스트 하네스가 없다(spec 0건). 계약을 여기 박제하고
 * vc16 logcat 으로 검증한다.
 *
 * | 사건                              | holder 없음                    | holder = 활성                     | holder = 비활성                  |
 * |-----------------------------------|--------------------------------|-----------------------------------|----------------------------------|
 * | request · 요청자 활성             | grant(요청자)                  | 큐 + queued 회신                  | 큐 + queued 회신 ※               |
 * | request · 요청자 비활성 (활성 有) | 큐 + queued 회신 (grant 안 함) | 큐 + queued 회신                  | 큐 + queued 회신                 |
 * | request · 활성 웹뷰 0 (폴백)      | grant(요청자) — 선착순         | 큐 + queued 회신                  | 큐 + queued 회신                 |
 * | setActive(x, true)                | 활성 승계 (없으면 대기)        | 변화 없음                         | holder 회수 → 활성 승계          |
 * | setActive(holder, false)          | —                              | 회수 → 활성 승계 · 활성 0 이면 유지 | (해당 없음)                      |
 * | token (회전 성공)                 | 전 웹뷰 방송 + 큐 비움         | 좌동 + holder 해제                | 좌동 (얼었던 holder 의 뒤늦은 성공) |
 * | release (회전 실패)               | 그 reqId 만 큐에서 제거        | holder 해제 → 활성 승계           | holder 해제 → 활성 승계          |
 * | holder 30s 타임아웃               | —                              | 해제 → 활성 승계                  | 해제 → 활성 승계 (얼어붙은 홀더 구제) |
 * | unregister(holder)                | —                              | 해제 → 활성 승계                  | 해제 → 활성 승계                 |
 *
 * 「활성 승계」 = 큐에서 **활성인 첫 항목**을 고른다(단순 FIFO 아님). 활성 대기자가 없으면
 * holder 를 비운 채 대기하고, 다음 request 나 setActive(true) 가 이어받는다.
 * ※ 활성 요청자가 왔는데 holder 가 비활성이면 blur 회수 직전의 찰나다 — 큐로 갔다가
 *   바로 뒤 setActive(focus) 가 승계시킨다.
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

/**
 * holder 가 죽었을 때 락을 되찾기까지의 상한.
 *
 * 🔴 부등식 (2026-08-13 실기 수리): **최악 회전 < 이 값 < 웹 대기 상한**
 *   최악 회전 ≈ 24.75s (웹 3시도 × HTTP 8s + 409 backoff 250+500) < 30s < 웹 상한 35s.
 * 옛 값 5s 는 "정상 회전 150~400ms" 기준이었고, 재개 직후 Wi-Fi 재결합·DNS·TLS 콜드
 * 스타트로 10s 걸린 회전을 **in-flight 중에** 끊어 대기자에게 승계 → 동시 회전을 만들었다.
 * 이 값은 "웹뷰가 죽었다"를 판정하는 값이지 "회전이 느리다"를 판정하는 값이 아니다.
 */
const HOLDER_TIMEOUT_MS = 30000

const webviews = new Map<string, InjectFn>()
/** 지금 화면에 보이는 웹뷰 id — JS 타이머가 살아 있는(= 락을 맡길 수 있는) 유일한 집합 */
const activeWebviews = new Set<string>()
/**
 * focus 보고를 한 번이라도 받았는가 — **폴백을 쓸지 가르는 유일한 근거**.
 *
 * 폴백(선착순 grant)은 "focus 추적이 통째로 안 되는 환경" 을 위한 것이지 "지금 아무것도
 * 화면에 없는 찰나" 를 위한 게 아니다. 그런데 판정을 `activeWebviews.size === 0` 하나로만
 * 하면 둘이 구분되지 않아, blur→focus 전이 구간이나 웹뷰 없는 화면에서 **얼어붙은 배경
 * 웹뷰에 락을 쥐여 준다**(2026-08-14 spec 도입 첫날 발견 · 실피해는 작지만 불변식 위반).
 * 한 번이라도 focus 가 왔다면 추적이 작동하는 것이므로, 활성이 0일 땐 폴백 대신 기다린다 —
 * 다음 focus 가 `rearbitrate` 로 이어받는다.
 */
let focusTrackingSeen = false
const queue: LockEntry[] = []
let holder: LockEntry | null = null
let holderTimer: ReturnType<typeof setTimeout> | null = null

function log(message: string): void {
  console.log(`[refreshLock] ${message}`)
}

function isActive(webviewId: string): boolean {
  return activeWebviews.has(webviewId)
}

/** 활성 표시 문자열 — grant/queue 로그에서 "누가 얼어붙을 수 있었나"를 vc16 에서 읽는다 */
function activeMark(webviewId: string): string {
  return isActive(webviewId) ? '활성' : '비활성'
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
    log(
      `holder timeout ${HOLDER_TIMEOUT_MS / 1000}s (${entry.webviewId}) → 자동 해제`,
    )
    holder = null
    holderTimer = null
    promoteNext()
  }, HOLDER_TIMEOUT_MS)
  injectEvent(entry.webviewId, 'chwippo:refresh-lock-grant', { reqId: entry.reqId })
  log(`grant → ${entry.webviewId} (${activeMark(entry.webviewId)} · 대기 ${queue.length})`)
}

/**
 * holder 가 비어 있을 때 큐의 **활성** 대기자에게 락을 승계.
 * 활성 대기자가 없으면 아무에게도 주지 않고 holder 를 비운 채 둔다 — 배경 웹뷰에 주면
 * 그 순간 락이 얼어붙어(위 원인 참조) 30s 타임아웃까지 전 탭이 막힌다.
 * 단 활성 웹뷰가 **하나도 없으면**(focus 보고가 통째로 없는 예외) 기존 FIFO 로 폴백한다.
 */
function promoteNext(): void {
  const i = queue.findIndex((e) => isActive(e.webviewId))
  if (i >= 0) {
    const [next] = queue.splice(i, 1)
    if (next) grant(next)
    return
  }
  if (activeWebviews.size === 0 && !focusTrackingSeen) {
    const next = queue.shift()
    if (next) grant(next)
    return
  }
  if (queue.length > 0) log(`승계 보류 — 대기 ${queue.length} 전원 비활성`)
}

/**
 * 활성 판정이 바뀐 뒤 락 주인을 다시 정한다 (setActive 전용).
 *   - holder 가 비활성이 됐으면 회수 — 얼어붙은 홀더가 30s 를 다 쓰는 걸 막는다.
 *     단 활성 웹뷰가 0개인 찰나(blur 가 focus 보다 먼저 오는 전이 구간·탭 밖 화면)엔
 *     회수하지 않는다. 넘겨줄 대상이 없어 이득이 없고, 그 상태에서 회수하면 위 FIFO
 *     폴백이 배경 웹뷰에 락을 쥐여 준다. 뒤이어 올 focus 가 이 함수를 다시 부른다.
 *   - holder 가 비었으면(회수했거나 원래 없었으면) 활성 대기자에게 승계.
 */
function rearbitrate(): void {
  if (holder && !isActive(holder.webviewId) && activeWebviews.size > 0) {
    log(`holder 비활성 전환 (${holder.webviewId}) → 회수`)
    holder = null
    clearHolderTimer()
  }
  if (holder) return
  promoteNext()
}

/** 웹뷰 마운트 — 방송 대상에 등록. 데모 웹뷰도 등록 무해 (회전 자체를 안 한다). */
export function register(webviewId: string, inject: InjectFn): void {
  webviews.set(webviewId, inject)
  log(`register ${webviewId} (총 ${webviews.size})`)
}

/** 웹뷰 언마운트 — 방송 대상에서 빼고 자기 pending(대기·보유) 정리 */
export function unregister(webviewId: string): void {
  webviews.delete(webviewId)
  // 활성 집합에서도 반드시 뺀다 — 죽은 id 가 남으면 "활성이 있다"고 오판해 폴백 FIFO 가
  // 영영 안 열리고 대기자 전원이 웹 상한(35s)까지 묶인다.
  activeWebviews.delete(webviewId)
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

/**
 * 웹 → 회전 직전 락 요청. **화면에 보이는 웹뷰 1명만** grant, 나머지는 조용히 큐 대기.
 * 활성 웹뷰가 아직 요청하지 않았더라도 배경 요청자에게 주지 않는다 — 주는 순간 얼어붙어
 * 30s 를 통째로 잡아먹기 때문. 활성 웹뷰가 요청하면 그때 즉시 grant 된다.
 */
export function handleLockRequest(webviewId: string, reqId: string): void {
  /*
    폴백: 활성 웹뷰가 **하나도 등록돼 있지 않은** 예외 상황(focus 보고가 안 오는 경로 등)
    에선 기존처럼 선착순 grant 한다. 락이 영영 안 나가는 것보다 낫고, 이 폴백 덕에
    focus 추적이 통째로 실패해도 동작이 수리 전과 동일해진다.
  */
  const grantable =
    isActive(webviewId) || (activeWebviews.size === 0 && !focusTrackingSeen)
  if (holder || !grantable) {
    queue.push({ webviewId, reqId })
    /*
      "큐에 넣었다"를 반드시 회신한다 — 없으면 웹은 '대기 중'과 '락 관리자 없는 구앱'을
      구분할 수 없어 무응답 폴백(700ms)을 그대로 태우고, 승자의 회전이 700ms 만 넘겨도
      대기자 전원이 단독 회전으로 흩어져 수리가 무력화된다. 이 회신을 받은 웹은 폴백을
      걷고 상한(35s)까지 승자의 방송·승계 grant 를 기다린다.
    */
    injectEvent(webviewId, 'chwippo:refresh-lock-queued', { reqId })
    log(
      `queue ${webviewId} (${activeMark(webviewId)} · holder=${
        holder?.webviewId ?? '없음'
      } · 대기 ${queue.length})`,
    )
    return
  }
  grant({ webviewId, reqId })
}

/**
 * AppWebView → 이 웹뷰가 지금 화면에 보이는지 보고 (탭 focus/blur).
 * 활성 판정이 바뀔 때만 락 주인을 재중재한다 (rearbitrate 참조).
 */
export function setActive(webviewId: string, active: boolean): void {
  if (isActive(webviewId) === active) return
  if (active) {
    activeWebviews.add(webviewId)
    focusTrackingSeen = true // 한 번 켜지면 안 끈다 — "추적이 되는 앱인가" 의 판정이다
  } else activeWebviews.delete(webviewId)
  log(`active ${active ? 'on' : 'off'} ${webviewId} (활성 ${activeWebviews.size})`)
  rearbitrate()
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
      불일치로 무시) 락이 holder 타임아웃 30s 까지 통째로 묶인다.
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
