import { cookies } from "next/headers";

const COOKIE = "ss_admin";

export async function isAdmin(): Promise<boolean> {
  const pass = process.env.ADMIN_PASSCODE;
  if (!pass) return false;
  const jar = await cookies();
  return jar.get(COOKIE)?.value === pass;
}

export const ADMIN_COOKIE = COOKIE;
