import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/api-json";
import { ADMIN_COOKIE, adminSessionCookie, createAdminSessionToken, isAdmin } from "@/lib/auth";

export async function GET() {
  return NextResponse.json({ admin: await isAdmin() });
}

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req);
  if ("error" in parsed) return parsed.error;
  const { passcode } = parsed.body as { passcode?: unknown };
  if (!process.env.ADMIN_PASSCODE || passcode !== process.env.ADMIN_PASSCODE) {
    return NextResponse.json({ error: "Wrong passcode" }, { status: 401 });
  }
  const token = createAdminSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Admin passcode not configured" }, { status: 500 });
  }
  const session = adminSessionCookie(token);
  const res = NextResponse.json({ admin: true });
  res.cookies.set(session.name, session.value, session.options);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ admin: false });
  res.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
  return res;
}
