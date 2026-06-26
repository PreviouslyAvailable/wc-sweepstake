const NZ_TZ = "Pacific/Auckland";

export { NZ_TZ };

export function fixtureNzstDate(ts: number): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleDateString("en-CA", { timeZone: NZ_TZ });
}

export function nzstCalendarDate(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: NZ_TZ });
}

export function fmtIssuedDate(now = new Date()): string {
  return now
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: NZ_TZ,
    })
    .toUpperCase();
}

export function fmtNzstTime(now = new Date()): string {
  return now.toLocaleTimeString("en-NZ", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: NZ_TZ,
    hour12: false,
  });
}

export function fmtFixtureDate(ts: number): string {
  return fmtFixtureNzstDate(ts);
}

export function fmtFixtureNzstDate(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000)
    .toLocaleDateString("en-NZ", {
      day: "2-digit",
      month: "short",
      timeZone: NZ_TZ,
    })
    .toUpperCase();
}

export function fmtFixtureKickoff(ts: number): string {
  return fmtFixtureNzstTime(ts);
}

export function fmtFixtureNzstTime(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleTimeString("en-NZ", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: NZ_TZ,
    hour12: false,
  });
}

export function fmtFixtureDateTime(ts: number): string {
  return fmtFixtureNzstDateTime(ts);
}

export function fmtFixtureNzstDateTime(ts: number): string {
  if (!ts) return "";
  return `${fmtFixtureNzstDate(ts)} · ${fmtFixtureNzstTime(ts)} NZST`;
}
