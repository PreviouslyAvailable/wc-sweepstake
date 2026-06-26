import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE = "ss_admin";

export async function isAdmin(): Promise<boolean> {
  const pass = process.env.ADMIN_PASSCODE;
  if (!pass) return false;
  const jar = await cookies();
  return jar.get(COOKIE)?.value === pass;
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

export async function requireCronOrAdmin(req: Request): Promise<NextResponse | null> {
  if (!(await isCronOrAdmin(req))) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  return null;
}

export const ADMIN_COOKIE = COOKIE;
