export const SPORTAPI_HOST = "sportapi7.p.rapidapi.com";

const RETRY_DELAY_MS = 1_200;
const MAX_RETRIES = 2;

export function sportApiHeaders(apiKey: string): HeadersInit {
  return {
    "X-RapidAPI-Key": apiKey,
    "X-RapidAPI-Host": SPORTAPI_HOST,
  };
}

export async function sportApiFetch(
  path: string,
  apiKey: string,
  init: RequestInit = {}
): Promise<Response> {
  const url = path.startsWith("http")
    ? path
    : `https://${SPORTAPI_HOST}/${path.replace(/^\//, "")}`;

  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { ...sportApiHeaders(apiKey), ...(init.headers ?? {}) },
    });
    lastRes = res;
    if (res.status !== 429 || attempt === MAX_RETRIES) return res;
    const body = await res.clone().text();
    if (body.toLowerCase().includes("monthly quota")) return res;
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
  }
  return lastRes!;
}
