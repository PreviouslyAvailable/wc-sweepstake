export const WC_START = "2026-06-11";

/** Every YYYY-MM-DD from `from` through `to`, inclusive. */
export function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const end = new Date(to);
  for (let d = new Date(from); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

/** Tournament kickoff through tomorrow — covers all played and imminent fixtures. */
export function liveFixtureDates(now = new Date()): string[] {
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dateRange(WC_START, fmt(tomorrow));
}
