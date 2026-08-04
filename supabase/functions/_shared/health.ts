import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type HealthStatus = "ok" | "error" | "timeout" | "market_closed";

export async function logHealth(
  client: SupabaseClient,
  source: string,
  status: HealthStatus,
  detail: string | null,
  latencyMs: number,
): Promise<void> {
  await client.from("pipeline_health").insert({ source, status, detail, latency_ms: latencyMs });
}
