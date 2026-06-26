import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE = "ss_admin";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 45;

function sessionSecret(): string | null {
  return process.env.ADMIN_PASSCODE ?? null;
}

function signPayload(payload: string): string {
  const secret = sessionSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createAdminSessionToken(): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const payload = `${Date.now()}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${signPayload(payload)}`;
}

function verifyAdminSessionToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const sig = parts[2];
  const expected = signPayload(payload);
  if (!expected) return false;
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }
  const issued = Number(parts[0]);
  if (!Number.isFinite(issued)) return false;
  const ageMs = Date.now() - issued;
  return ageMs >= 0 && ageMs <= SESSION_MAX_AGE_SEC * 1000;
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return false;
  return verifyAdminSessionToken(token);
}

/** Vercel cron jobs send `Authorization: Bearer <CRON_SECRET>`. */
export function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function isCronOrAdmin(req: Request): Promise<boolean> {
  return isCronRequest(req) || (await isAdmin());
}

export async function requireAdmin(): Promise<NextResponse | null> {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  return null;
}

export async function requireCron(req: Request): Promise<NextResponse | null> {
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  return null;
}

export async function requireCronOrAdmin(req: Request): Promise<NextResponse | null> {
  if (!(await isCronOrAdmin(req))) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  return null;
}

export function adminSessionCookie(token: string): {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    sameSite: "lax";
    secure: boolean;
    maxAge: number;
    path: string;
  };
} {
  return {
    name: COOKIE,
    value: token,
    options: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE_SEC,
      path: "/",
    },
  };
}

export const ADMIN_COOKIE = COOKIE;
