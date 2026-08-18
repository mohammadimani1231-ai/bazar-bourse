import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { checkMarketOpenLight } from "../_shared/marketStatus.ts";
import { fetchBrsApiIndex } from "../../../lib/data-sources/brsapi.ts";

/**
 * خلاصهٔ زندهٔ شاخص کل/هم‌وزن + ارزش کل بازار (Tsetmc/Index.php?type=1) — رجوع به CLAUDE.md
 * برای علت وجودش (benchmark_candles(tedpix) هیچ به‌روزرسانی زنده‌ای نداشت).
 */
Deno.serve(async () => {
  const start = performance.now();
  const client = createServiceClient();

  try {
    const marketStatus = await checkMarketOpenLight(client);
    if (!marketStatus.open) {
      const latencyMs = Math.round(performance.now() - start);
      await logHealth(client, "collect-market-index", "market_closed", marketStatus.reason, latencyMs);
      return new Response(JSON.stringify({ ok: true, skipped: "market_closed", reason: marketStatus.reason }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const brsApiKey = Deno.env.get("BRSAPI_KEY") ?? "";
    const summary = await fetchBrsApiIndex(brsApiKey);

    // ارزش معاملات بورس تهران (تکی، بدون فرابورس)
    // فرابورس (type=2) برای فاز بعدی است

    const { error: insertError } = await client.from("market_index_quotes").insert({
      index_value: summary.index,
      index_change: summary.index_change,
      index_equal_weight: summary.index_equalWeight,
      index_equal_weight_change: summary.index_equalWeight_change,
      market_value: summary.mv,
      total_trade_value: summary.tval,
      total_trade_count: summary.tno,
      total_trade_volume: summary.tvol,
      market_state: summary.state,
    });
    if (insertError) throw insertError;

    const latencyMs = Math.round(performance.now() - start);
    await logHealth(client, "collect-market-index", "ok", `index=${summary.index} state=${summary.state}`, latencyMs);

    return new Response(JSON.stringify({ ok: true, index: summary.index }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    await logHealth(client, "collect-market-index", "error", message, latencyMs);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
