import { NextResponse } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/auth";
import { body } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.json({ ok: true });
  const b = await body<{ password?: string }>(req);
  if ((await authToken(b.password ?? "")) !== (await authToken(password))) {
    // Deneme yanılmayı yavaşlat
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "Şifre yanlış" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await authToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

/** Çıkış */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(AUTH_COOKIE);
  return res;
}
