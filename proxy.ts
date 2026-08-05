import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SITE_SESSION_COOKIE, sitePasswordHash } from "./lib/siteAuth.ts";

/**
 * گیت رمز مشترک روی کل سایت (به‌جز خود صفحهٔ /login). طبق مستندات Next.js 16
 * (node_modules/next/dist/docs/.../proxy.md): «Server Function ها مسیر جدا نیستند، با POST به
 * همان مسیری که استفاده می‌شوند می‌روند» — پس matcher نباید هیچ صفحه‌ای با Server Action
 * نوشتنی (افزودن به واچ‌لیست، سوییچ رژیم، ذخیرهٔ preset) را استثنا کند.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }
  // فراخوانندهٔ این مسیر یک Supabase Edge Function است، نه مرورگر — کوکی سشن ندارد و نباید
  // به /login ریدایرکت شود. خودش با هدر سرّی BRSAPI_PROXY_SECRET محافظت می‌شود (route.ts).
  if (pathname.startsWith("/api/internal/")) {
    return NextResponse.next();
  }

  const expectedPassword = process.env.SITE_PASSWORD;
  const expectedHash = expectedPassword ? sitePasswordHash(expectedPassword) : null;
  const sessionCookie = request.cookies.get(SITE_SESSION_COOKIE)?.value;

  if (!expectedHash || sessionCookie !== expectedHash) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
