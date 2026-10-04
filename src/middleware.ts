import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

/**
 * İsteğe bağlı şifre koruması: APP_PASSWORD tanımlıysa giriş yapılmadan
 * sayfalar ve API açılmaz. Tanımlı değilse uygulama herkese açıktır.
 */
export async function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  if (req.cookies.get(AUTH_COOKIE)?.value === (await authToken(password))) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/giris";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Giriş sayfası, günlük görev ve statik dosyalar hariç her şey korunur.
  matcher: ["/((?!_next/static|_next/image|icon\\.svg|favicon\\.ico|manifest\\.webmanifest|giris|api/giris|api/cron).*)"],
};
