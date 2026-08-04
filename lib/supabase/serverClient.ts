import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * کلاینت سمت سرور برای Server Componentها (fetch اولیهٔ داده).
 * فقط anon key — هیچ نوشتنی از اینجا انجام نشود (قید ۲ در CLAUDE.md).
 */
export function createServerSupabaseClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}
