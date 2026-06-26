/** Live feed sync is opt-in — off by default so the comp runs on manual results only. */
export function isSportApiEnabled(): boolean {
  return process.env.SPORTAPI_ENABLED === "true" && Boolean(process.env.RAPIDAPI_KEY);
}
