const TZ = "Europe/London";
const NZ_TZ = "Pacific/Auckland";

export function fmtFixtureDate(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000)
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      timeZone: TZ,
    })
    .toUpperCase();
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
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
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
  if (!ts) return "";
  const date = new Date(ts * 1000).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  });
  return `${date.toUpperCase()} · ${fmtFixtureKickoff(ts)}`;
}

export function fmtFixtureNzstDateTime(ts: number): string {
  if (!ts) return "";
  return `${fmtFixtureNzstDate(ts)} · ${fmtFixtureNzstTime(ts)} NZST`;
}
