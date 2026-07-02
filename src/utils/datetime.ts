import dayjs from 'dayjs'

/**
 * KST 고정 앱 datetime 헬퍼 · memory [[kst_local_date]] 원칙 준수.
 *
 * 치뽀 = 한국 취준생 KST-fixed. `toISOString().slice(0,10)` 금지 · 이 모듈만 사용.
 * `tz?` 옵셔널 인자로 미래 user TZ 확장 친화.
 *
 * 표시는 반드시 "(KST)" 라벨 명시.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** KST 오늘 날짜 YYYY-MM-DD */
export function todayKst(_tz?: string): string {
  const kst = new Date(Date.now() + KST_OFFSET_MS)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(kst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 두 KST 날짜 사이 dday · 오늘=0 · 미래=양수 · 과거=음수 */
export function calcDday(deadlineISO: string, _tz?: string): number {
  const today = dayjs(todayKst()).startOf('day')
  const deadline = dayjs(deadlineISO).startOf('day')
  return deadline.diff(today, 'day')
}

/** D-day 라벨 · D-day / D-N / D+N */
export function formatDdayLabel(dday: number): string {
  if (dday === 0) return 'D-day'
  if (dday > 0) return `D-${dday}`
  return `D+${Math.abs(dday)}`
}

/** KST 날짜 표시 · "7월 3일 (금)" 한국어 포맷 */
export function formatDateKo(iso: string, _tz?: string): string {
  const d = dayjs(iso)
  const KO_DAYS = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.month() + 1}월 ${d.date()}일 (${KO_DAYS[d.day()]})`
}
