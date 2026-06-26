import { NextResponse } from "next/server";

export async function parseJsonBody<T = Record<string, unknown>>(
  req: Request
): Promise<{ body: T } | { error: NextResponse }> {
  try {
    const body = (await req.json()) as T;
    return { body };
  } catch {
    return { error: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) };
  }
}

export function requireId(
  id: unknown,
  label = "id"
): { id: string } | { error: NextResponse } {
  if (typeof id !== "string" || !id.trim()) {
    return { error: NextResponse.json({ error: `${label} required` }, { status: 400 }) };
  }
  return { id: id.trim() };
}
