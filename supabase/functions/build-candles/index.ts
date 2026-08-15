import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { checkTodayWasTradingDay } from "../_shared/marketStatus.ts";
import { fetchAllPages } from "../../../lib/supabase/fetchAllPages.ts";
import { tehranDayBounds } from "../../../lib/time/tehranDay.ts";
import { buildDailyCandle, buildOhlcFromSeries, type SeriesPoint } from "../../../lib/transforms/candle.ts";
import type { QuoteRow } from "../../../lib/transforms/quote.ts";

/**
 * از تیک‌های زندهٔ market_index_quotes امروز، کندل روزانهٔ شاخص کل/هم‌وزن benchmark_candles را
 * می‌سازد — قبل از این incident اصلاً هیچ نویسندهٔ زنده‌ای برای این دو asset نبود (فقط اسکریپت
 * پایتون یک‌بارمصرف backfill_benchmarks.py). عیناً همان buildOhlcFromSeries که برای collect-tse
 * هم استفاده می‌شود — بدون پیاده‌سازی موازی.
 */
async function buildIndexBenchmarkCandles(
  client: ReturnType<typeof createServiceClient>,
  date: string,
  startUtc: string,
  endUtc: string,
): Promise<number> {
  const { data: indexQuotes, error } = await client
    .from("market_index_quotes")
    .select("index_value, index_equal_weight, captured_at")
    .gte("captured_at", startUtc)
    .lt("captured_at", endUtc);
  if (error) throw error;

  const rows = (indexQuotes ?? []) as { index_value: number | null; index_equal_weight: number | null; captured_at: string }[];
  const tedpixSeries: SeriesPoint[] = rows.map((r) => ({ capturedAt: r.captured_at, value: r.index_value }));
  const equalWeightSeries: SeriesPoint[] = rows.map((r) => ({ capturedAt: r.captured_at, value: r.index_equal_weight }));

  const tedpixOhlc = buildOhlcFromSeries(tedpixSeries);
  const equalWeightOhlc = buildOhlcFromSeries(equalWeightSeries);

  const benchmarkCandles = [
    tedpixOhlc && { asset: "tedpix", date, ...tedpixOhlc },
    equalWeightOhlc && { asset: "tedpix_equal_weight", date, ...equalWeightOhlc },
  ].filter((c): c is NonNullable<typeof c> => c != null);

  if (benchmarkCandles.length > 0) {
    const { error: upsertError } = await client.from("benchmark_candles").upsert(benchmarkCandles, { onConflict: "asset,date" });
    if (upsertError) throw upsertError;
  }
  return benchmarkCandles.length;
}

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

    // صفحه‌بندی‌شده (سقف ۱۰۰۰ ردیفی PostgREST) — بدونش close/final_price/adjusted_close هر
    // نماد از آخرین ردیف *داخل همان ۱۰۰۰ تای اول* ساخته می‌شد، نه آخرین قیمت واقعی روز.
    const quotes = await fetchAllPages<QuoteRow>(async (from, to) => {
      const { data, error } = await client
        .from("quotes")
        .select("*")
        .gte("captured_at", startUtc)
        .lt("captured_at", endUtc)
        .order("captured_at", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as QuoteRow[];
    });

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

    const indexCandles = await buildIndexBenchmarkCandles(client, date, startUtc, endUtc);

    const latencyMs = Math.round(performance.now() - start);
    await logHealth(
      client,
      "build-candles",
      "ok",
      `${candles.length} candles for ${date}, ${indexCandles} index benchmark candles`,
      latencyMs,
    );

    return new Response(JSON.stringify({ ok: true, date, candles: candles.length, indexCandles }), {
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
