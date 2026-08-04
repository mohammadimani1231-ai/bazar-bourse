import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { checkTodayWasTradingDay } from "../_shared/marketStatus.ts";
import { tehranDayBounds } from "../../../lib/time/tehranDay.ts";
import { buildDailyCandle } from "../../../lib/transforms/candle.ts";
import type { QuoteRow } from "../../../lib/transforms/quote.ts";

Deno.serve(async () => {
  const start = performance.now();
  const client = createServiceClient();

  try {
    const wasTradingDay = await checkTodayWasTradingDay(client);
    if (!wasTradingDay) {
      const latencyMs = Math.round(performance.now() - start);
      await logHealth(client, "build-candles", "market_closed", "not a trading day", latencyMs);
      return new Response(JSON.stringify({ ok: true, skipped: "market_closed" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { date, startUtc, endUtc } = tehranDayBounds(new Date());

    const { data: quotes, error } = await client
      .from("quotes")
      .select("*")
      .gte("captured_at", startUtc)
      .lt("captured_at", endUtc);
    if (error) throw error;

    const bySymbol = new Map<string, QuoteRow[]>();
    for (const q of (quotes ?? []) as QuoteRow[]) {
      const list = bySymbol.get(q.symbol) ?? [];
      list.push(q);
      bySymbol.set(q.symbol, list);
    }

    const candles = [...bySymbol.entries()]
      .map(([symbol, dayQuotes]) => buildDailyCandle(symbol, date, dayQuotes))
      .filter((c): c is NonNullable<typeof c> => c !== null);

    if (candles.length > 0) {
      const { error: upsertError } = await client
        .from("daily_candles")
        .upsert(candles, { onConflict: "symbol,date" });
      if (upsertError) throw upsertError;
    }

    const latencyMs = Math.round(performance.now() - start);
    await logHealth(client, "build-candles", "ok", `${candles.length} candles for ${date}`, latencyMs);

    return new Response(JSON.stringify({ ok: true, date, candles: candles.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    await logHealth(client, "build-candles", "error", message, latencyMs);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
