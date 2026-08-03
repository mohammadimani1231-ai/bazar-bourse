import { createClient } from "npm:@supabase/supabase-js@2";

/** کلاینت service_role — فقط داخل Edge Function، هرگز سمت کلاینت. */
export function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}
