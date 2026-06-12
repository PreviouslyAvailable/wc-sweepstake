import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/auth";

export async function GET() {
  return NextResponse.json({ admin: await isAdmin() });
}

export async function POST(req: NextRequest) {
  const { passcode } = await req.json();
  if (!process.env.ADMIN_PASSCODE || passcode !== process.env.ADMIN_PASSCODE) {
    return NextResponse.json({ error: "Wrong passcode" }, { status: 401 });
  }
  const res = NextResponse.json({ admin: true });
  res.cookies.set(ADMIN_COOKIE, passcode, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 45, // covers the whole tournament
    path: "/",
  });
  return res;
}
