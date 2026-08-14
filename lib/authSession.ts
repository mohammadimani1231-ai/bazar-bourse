import "server-only";
import { cookies } from "next/headers";
import { createAdminSupabaseClient } from "@/lib/supabase/adminClient.ts";
import { SITE_SESSION_COOKIE } from "@/lib/auth.ts";

export interface CurrentUser {
  username: string;
  isAdmin: boolean;
}

/**
 * برای مسیرهای حساس (مدیریت کاربران) — به‌جای اعتماد به هدر x-site-is-admin که proxy.ts پاس
 * می‌دهد (که خودش امن است، چون کلاینت نمی‌تواند override‌اش کند)، مستقیم از site_users
 * می‌خواند تا حتی اگر روزی matcher عوض شد، این مسیر مستقل از آن درست بماند.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SITE_SESSION_COOKIE)?.value;
  if (!token) return null;

  const supabase = createAdminSupabaseClient();
  const { data: user } = await supabase
    .from("site_users")
    .select("username, is_admin")
    .eq("session_token", token)
    .maybeSingle();

  return user ? { username: user.username, isAdmin: user.is_admin } : null;
}
