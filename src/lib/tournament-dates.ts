import { fixtureNzstDate, nzstCalendarDate } from "@/lib/match-dates";

export const WC_START = "2026-06-11";
export const WC_END = "2026-07-20";

/** Every YYYY-MM-DD from `from` through `to`, inclusive (NZST calendar days). */
export function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

/** Tournament kickoff through tomorrow — covers all played and imminent fixtures. */
export function liveFixtureDates(now = new Date()): string[] {
  const today = nzstCalendarDate(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = nzstCalendarDate(tomorrow);
  return dateRange(WC_START, tomorrowStr);
}

/** Live page — 7-day lookback for result stubs plus 14-day fixture lookahead. */
export function livePageFixtureDates(now = new Date()): string[] {
  const lookback = new Date(now);
  lookback.setDate(lookback.getDate() - 7);
  const from = nzstCalendarDate(lookback) < WC_START ? WC_START : nzstCalendarDate(lookback);
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 14);
  const to = nzstCalendarDate(horizon) > WC_END ? WC_END : nzstCalendarDate(horizon);
  return dateRange(from, to);
}

/** Today through 14 days ahead (capped at tournament end) — next-fixture lookahead. */
export function nextFixtureDates(now = new Date()): string[] {
  const today = nzstCalendarDate(now);
  const from = today < WC_START ? WC_START : today;
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 14);
  const to = nzstCalendarDate(horizon) > WC_END ? WC_END : nzstCalendarDate(horizon);
  return dateRange(from, to);
}

/** True when fixture kickoff falls on one of the allowed NZST dates. */
export function fixtureInDateWindow(ts: number, dates: string[]): boolean {
  if (!dates.length) return true;
  const allowed = new Set(dates);
  const kickoffDay = fixtureNzstDate(ts);
  if (allowed.has(kickoffDay)) return true;
  // Include fixtures on adjacent NZST days near window edges (late local kickoffs).
  const prev = new Date(`${kickoffDay}T12:00:00`);
  prev.setDate(prev.getDate() - 1);
  const next = new Date(`${kickoffDay}T12:00:00`);
  next.setDate(next.getDate() + 1);
  return (
    allowed.has(prev.toISOString().split("T")[0]) ||
    allowed.has(next.toISOString().split("T")[0])
  );
}
