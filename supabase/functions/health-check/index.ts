import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { checkMarketOpen } from "../_shared/marketStatus.ts";

const STALE_THRESHOLD_MS = 15 * 60 * 1000;

Deno.serve(async () => {
  const start = performance.now();
  const client = createServiceClient();

  try {
    const marketStatus = await checkMarketOpen(client);
    if (!marketStatus.open) {
      // هشدار «مرگ پایپ‌لاین» فقط وقتی بازار باز است معنا دارد — قید CLAUDE.md #11
      const latencyMs = Math.round(performance.now() - start);
      await logHealth(client, "health-check", "market_closed", marketStatus.reason, latencyMs);
      return new Response(JSON.stringify({ ok: true, skipped: "market_closed", reason: marketStatus.reason }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data, error } = await client
      .from("quotes")
      .select("captured_at")
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    const latencyMs = Math.round(performance.now() - start);

    if (!data) {
      await logHealth(client, "health-check", "error", "no quotes found", latencyMs);
      return new Response(JSON.stringify({ ok: false, reason: "no_quotes" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const ageMs = Date.now() - new Date(data.captured_at as string).getTime();
    const stale = ageMs > STALE_THRESHOLD_MS;

    await logHealth(
      client,
      "health-check",
      stale ? "error" : "ok",
      `latest quote ${Math.round(ageMs / 1000)}s old`,
      latencyMs,
    );

    return new Response(JSON.stringify({ ok: !stale, ageSeconds: Math.round(ageMs / 1000) }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    await logHealth(client, "health-check", "error", message, latencyMs);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
