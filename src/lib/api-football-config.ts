export const API_FOOTBALL_HOST = "v3.football.api-sports.io";
export const API_FOOTBALL_BASE = `https://${API_FOOTBALL_HOST}`;
export const API_FOOTBALL_WC_LEAGUE = 1;
export const API_FOOTBALL_WC_SEASON = 2026;

/** Card counts via API-Football — opt-in; WC 2026 needs a paid plan. */
export function isApiFootballEnabled(): boolean {
  return process.env.API_FOOTBALL_ENABLED === "true" && Boolean(process.env.API_FOOTBALL_KEY);
}

export function isCardSyncEnabled(): boolean {
  return (
    isApiFootballEnabled() ||
    (process.env.SPORTAPI_ENABLED === "true" && Boolean(process.env.RAPIDAPI_KEY))
  );
}
