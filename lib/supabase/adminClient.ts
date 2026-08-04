import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * کلاینت service_role — فقط داخل Server Actionها برای نوشتن (قید ۲ در CLAUDE.md).
 * import "server-only" باندل‌شدنش در کد کلاینت را در زمان build خطا می‌کند.
 */
export function createAdminSupabaseClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
