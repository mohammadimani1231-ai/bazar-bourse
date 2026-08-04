import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * کلاینت مرورگر — singleton، برای Client Componentها (کوئری + Realtime).
 * فقط anon key (RLS محدودش می‌کند به SELECT روی جدول‌های عمومی).
 */
let client: SupabaseClient | undefined;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return client;
}
