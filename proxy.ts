import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "./lib/supabase/adminClient.ts";
import { SITE_SESSION_COOKIE } from "./lib/auth.ts";

/**
 * گیت ورود کل سایت (به‌جز خود صفحهٔ /login) با کاربر/رمز واقعی (جدول site_users) — جایگزین
 * رمز مشترک تک‌نفرهٔ قبلی (SITE_PASSWORD). طبق مستندات Next.js 16
 * (node_modules/next/dist/docs/.../proxy.md): «Server Function ها مسیر جدا نیستند، با POST به
 * همان مسیری که استفاده می‌شوند می‌روند» — پس matcher نباید هیچ صفحه‌ای با Server Action
 * نوشتنی (افزودن به واچ‌لیست، سوییچ رژیم، ذخیرهٔ preset) را استثنا کند.
 *
 * هر درخواست یک کوئری به site_users می‌زند (نه چک stateless) تا لغو دسترسی توسط ادمین فوری
 * اثر کند — این حجم ترافیک برای یک داشبورد شخصی/چندنفرهٔ کوچک بی‌اهمیت است؛ ترافیک زندهٔ
 * Supabase Realtime مستقیم مرورگر↔Supabase است و از این مسیر رد نمی‌شود.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }
  // فراخوانندهٔ این مسیر یک Supabase Edge Function است، نه مرورگر — کوکی سشن ندارد و نباید
  // به /login ریدایرکت شود. خودش با هدر سرّی BRSAPI_PROXY_SECRET محافظت می‌شود (route.ts).
  if (pathname.startsWith("/api/internal/")) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(SITE_SESSION_COOKIE)?.value;
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);

  if (!sessionToken) {
    return NextResponse.redirect(loginUrl);
  }

  const supabase = createAdminSupabaseClient();
  const { data: user } = await supabase
    .from("site_users")
    .select("username, is_admin")
    .eq("session_token", sessionToken)
    .maybeSingle();

  if (!user) {
    return NextResponse.redirect(loginUrl);
  }

  // به‌جای کوئری دوبارهٔ site_users در layout.tsx (Server Component) برای نمایش نام
  // کاربر/لینک ادمین، همین‌جا که یک‌بار خوانده شده به‌عنوان هدر درخواست پاس داده می‌شود.
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set("x-site-username", user.username);
  forwardedHeaders.set("x-site-is-admin", user.is_admin ? "1" : "0");

  return NextResponse.next({ request: { headers: forwardedHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
