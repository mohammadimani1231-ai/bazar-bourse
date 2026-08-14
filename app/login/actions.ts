"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/adminClient.ts";
import { SITE_SESSION_COOKIE, generateSessionToken, verifyPassword } from "@/lib/auth.ts";

function safeNextPath(next: string): string {
  // فقط مسیر داخلی مجاز است — از open-redirect با //evil.com یا آدرس مطلق جلوگیری می‌کند
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function login(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? "/"));

  if (!username || !password) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const supabase = createAdminSupabaseClient();
  const { data: user } = await supabase
    .from("site_users")
    .select("id, password_hash, password_salt")
    .eq("username", username)
    .maybeSingle();

  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const sessionToken = generateSessionToken();
  await supabase
    .from("site_users")
    .update({ session_token: sessionToken, last_login_at: new Date().toISOString() })
    .eq("id", user.id);

  (await cookies()).set(SITE_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  // app/layout.tsx نام‌کاربری/ادمین‌بودن را از هدرهای proxy.ts می‌خواند، ولی چون layout ریشه
  // بین همهٔ مسیرها مشترک است، Next.js بدون این خط رندر کش‌شدهٔ قبلی‌اش (کاربر/سشن قبلی) را در
  // ناوبری بعد از redirect دوباره استفاده می‌کند و Header/Sidebar تا رفرش کامل صفحه به‌روز نمی‌شوند.
  revalidatePath("/", "layout");
  redirect(next);
}

/**
 * عمداً خودش redirect نمی‌کند (برخلاف login) — چون این تابع از داخل Header.tsx (که در همهٔ
 * صفحات مشترک است) صدا زده می‌شود، Next.js Router Cache گاهی رندر قدیمی لایوت (نام کاربری
 * قبلی) را بعد از redirect داخل Server Action دوباره استفاده می‌کرد (تأیید زندهٔ باگ با
 * agent-browser) — Header.tsx بعد از این تابع خودش با window.location یک navigation کامل
 * می‌زند تا کش کلاینت کاملاً دور ریخته شود، نه فقط revalidate جزئی.
 */
export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SITE_SESSION_COOKIE)?.value;

  if (token) {
    const supabase = createAdminSupabaseClient();
    await supabase.from("site_users").update({ session_token: null }).eq("session_token", token);
  }

  cookieStore.delete(SITE_SESSION_COOKIE);
}
