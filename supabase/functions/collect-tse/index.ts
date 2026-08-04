import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { checkMarketOpenLight } from "../_shared/marketStatus.ts";
import { fetchBrsApiAllSymbols } from "../../../lib/data-sources/brsapi.ts";
import { brsApiRowToQuoteRow } from "../../../lib/transforms/quote.ts";

Deno.serve(async () => {
  const start = performance.now();
  const client = createServiceClient();

  try {
    const marketStatus = await checkMarketOpenLight(client);
    if (!marketStatus.open) {
      const latencyMs = Math.round(performance.now() - start);
      await logHealth(client, "collect-tse", "market_closed", marketStatus.reason, latencyMs);
      return new Response(JSON.stringify({ ok: true, skipped: "market_closed", reason: marketStatus.reason }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const brsApiKey = Deno.env.get("BRSAPI_KEY") ?? "";

    const { data: watchlist, error: watchlistError } = await client
      .from("watchlist")
      .select("symbol");
    if (watchlistError) throw watchlistError;

    const symbols = new Set((watchlist ?? []).map((w) => w.symbol as string));

    // یک درخواست بالک برای همهٔ نمادها — سهمیهٔ روزانهٔ تک‌نماد خیلی کمتر از نیاز ماست.
    const allSymbols = await fetchBrsApiAllSymbols(brsApiKey);
    const capturedAt = new Date().toISOString();

    const rows = allSymbols
      .filter((row) => row.l18 && symbols.has(row.l18))
      .map((row) => brsApiRowToQuoteRow(row.l18 as string, row, capturedAt));

    if (rows.length > 0) {
      const { error: insertError } = await client.from("quotes").insert(rows);
      if (insertError) throw insertError;
    }

    const latencyMs = Math.round(performance.now() - start);
    await logHealth(client, "collect-tse", "ok", `${rows.length}/${symbols.size} symbols`, latencyMs);

    return new Response(JSON.stringify({ ok: true, inserted: rows.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    await logHealth(client, "collect-tse", "error", message, latencyMs);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
