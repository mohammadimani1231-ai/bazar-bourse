import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { checkTodayWasTradingDay } from "../_shared/marketStatus.ts";
import { tehranDayBounds } from "../../../lib/time/tehranDay.ts";
import { computeRawScore, percentileRank } from "../../../lib/composite-rank.ts";

const PAGE_SIZE = 1000;

async function fetchAllCloses(
  client: SupabaseClient,
  symbol: string,
): Promise<number[]> {
  const closes: number[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from("daily_candles")
      .select("adjusted_close")
      .eq("symbol", symbol)
      .order("date", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.adjusted_close != null) closes.push(row.adjusted_close as number);
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return closes;
}

/**
 * شبانه بعد از build-candles: رتبهٔ فنی مرکب (lib/composite-rank.ts) هر نماد watchlist را
 * از کل تاریخچهٔ adjusted_close آن محاسبه، سپس بین همهٔ نمادها پرسنتایل‌رتبه‌بندی می‌کند.
 */
Deno.serve(async () => {
  const start = performance.now();
  const client = createServiceClient();

  try {
    const wasTradingDay = await checkTodayWasTradingDay(client);
    if (!wasTradingDay) {
      const latencyMs = Math.round(performance.now() - start);
      await logHealth(client, "compute-rank", "market_closed", "not a trading day", latencyMs);
      return new Response(JSON.stringify({ ok: true, skipped: "market_closed" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: watchlist, error: watchlistError } = await client.from("watchlist").select("symbol");
    if (watchlistError) throw watchlistError;
    const symbols = (watchlist ?? []).map((w) => w.symbol as string);

    const scored = [];
    for (const symbol of symbols) {
      const closes = await fetchAllCloses(client, symbol);
      const { rawScore, components } = computeRawScore(closes);
      scored.push({ symbol, rawScore, components });
    }

    const ranked = percentileRank(scored.map((s) => ({ symbol: s.symbol, rawScore: s.rawScore })));
    const rankBySymbol = new Map(ranked.map((r) => [r.symbol, r]));
    const { date } = tehranDayBounds(new Date());

    const rows = scored
      .map((s) => {
        const r = rankBySymbol.get(s.symbol);
        if (!r) return null;
        return { symbol: s.symbol, date, rank: r.rank, raw_score: r.rawScore, components: s.components };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length > 0) {
      const { error: upsertError } = await client
        .from("composite_rank")
        .upsert(rows, { onConflict: "symbol,date" });
      if (upsertError) throw upsertError;
    }

    const latencyMs = Math.round(performance.now() - start);
    await logHealth(client, "compute-rank", "ok", `${rows.length}/${symbols.length} symbols ranked for ${date}`, latencyMs);

    return new Response(JSON.stringify({ ok: true, date, ranked: rows.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    await logHealth(client, "compute-rank", "error", message, latencyMs);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
