/** IANA zones for FIFA World Cup 2026 host venues (worldcup26.ir stadium ids). */
const STADIUM_TZ: Record<string, string> = {
  "1": "America/Mexico_City",
  "2": "America/Mexico_City",
  "3": "America/Monterrey",
  "4": "America/Chicago",
  "5": "America/Chicago",
  "6": "America/Chicago",
  "7": "America/New_York",
  "8": "America/New_York",
  "9": "America/New_York",
  "10": "America/New_York",
  "11": "America/New_York",
  "12": "America/Toronto",
  "13": "America/Vancouver",
  "14": "America/Los_Angeles",
  "15": "America/Los_Angeles",
  "16": "America/Los_Angeles",
};

const DEFAULT_VENUE_TZ = "America/New_York";

export function timezoneForStadium(stadiumId: string | undefined | null): string {
  if (!stadiumId) return DEFAULT_VENUE_TZ;
  return STADIUM_TZ[stadiumId] ?? DEFAULT_VENUE_TZ;
}

/** Wall-clock kickoff at a venue → UTC epoch seconds. */
export function venueLocalToUtcEpoch(
  localDate: string,
  stadiumId: string | undefined | null
): number {
  const [datePart, timePart = "00:00"] = localDate.trim().split(/\s+/);
  const [month, day, year] = datePart.split("/").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const timeZone = timezoneForStadium(stadiumId);

  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i++) {
    const offsetMin = timezoneOffsetMinutes(new Date(utcMs), timeZone);
    utcMs = Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMin * 60_000;
  }

  return Math.floor(utcMs / 1000);
}

function timezoneOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(date).map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtc - date.getTime()) / 60_000;
}
