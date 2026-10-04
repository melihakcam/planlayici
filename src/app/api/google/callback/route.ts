import { NextResponse, type NextRequest } from "next/server";
import { syncNow } from "@/lib/events";
import { appUrl, connectWithCode } from "@/lib/google";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const back = (q: string) => {
    const res = NextResponse.redirect(`${appUrl()}/ayarlar?google=${q}`);
    res.cookies.delete("g_oauth_state");
    return res;
  };
  if (u.searchParams.get("error")) return back("iptal");
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("g_oauth_state")?.value) return back("gecersiz");
  try {
    await connectWithCode(code);
    await syncNow().catch((e) => console.error("[ilk senkron]", e));
    return back("baglandi");
  } catch (e) {
    console.error("[google callback]", e);
    return back((e as Error).message === "takvim-izni-yok" ? "izin-eksik" : "hata");
  }
}
