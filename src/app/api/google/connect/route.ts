import { NextResponse } from "next/server";
import { appUrl, authUrl, googleConfigured } from "@/lib/google";

export const dynamic = "force-dynamic";

export function GET() {
  if (!googleConfigured()) {
    return NextResponse.redirect(`${appUrl()}/ayarlar?google=yapilandirilmamis`);
  }
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authUrl(state));
  res.cookies.set("g_oauth_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
