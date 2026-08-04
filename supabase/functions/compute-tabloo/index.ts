import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { checkMarketOpen } from "../_shared/marketStatus.ts";
import { tehranDayBounds } from "../../../lib/time/tehranDay.ts";
import type { QuoteRow } from "../../../lib/transforms/quote.ts";
import type { DailyCandleRow } from "../../../lib/transforms/candle.ts";
import {
  perCapitaBuy,
  perCapitaSell,
  buyerPower,
  moneyFlow,
  moneyFlowByIndustry,
  isSuspiciousVolume,
  isWhaleBuyer,
  isCodeToCode,
  queueState,
  queueVelocity,
  marketPerCapita,
  detectCrossovers,
} from "../../../lib/tabloo.ts";

interface MetricRow {
  symbol: string;
  metric: string;
  value: number | null;
  meta: Record<string, unknown> | null;
  captured_at: string;
}

type CandleSlice = Pick<DailyCandleRow, "volume" | "buy_i_volume" | "buy_count_i" | "final_price" | "date">;

const bool01 = (v: boolean | null): number | null => (v == null ? null : v ? 1 : 0);

Deno.serve(async () => {
  const start = performance.now();
  const client = createServiceClient();

  try {
    const marketStatus = await checkMarketOpen(client);
    if (!marketStatus.open) {
      const latencyMs = Math.round(performance.now() - start);
      await logHealth(client, "compute-tabloo", "market_closed", marketStatus.reason, latencyMs);
      return new Response(JSON.stringify({ ok: true, skipped: "market_closed", reason: marketStatus.reason }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const capturedAt = now.toISOString();
    const { startUtc: dayStartUtc } = tehranDayBounds(now);

    const { data: watchlist, error: watchlistError } = await client
      .from("watchlist")
      .select("symbol, industry");
    if (watchlistError) throw watchlistError;
    const symbols = (watchlist ?? []).map((w) => w.symbol as string);
    const industryOf = new Map((watchlist ?? []).map((w) => [w.symbol as string, w.industry as string | null]));

    // امروز تا الان — برای متریک‌های لحظه‌ای (آخرین اسنپ‌شات هر نماد) و سری زمانی سرانه بازار
    const { data: todayQuotesRaw, error: quotesError } = await client
      .from("quotes")
      .select("*")
      .gte("captured_at", dayStartUtc)
      .lte("captured_at", capturedAt)
      .order("captured_at", { ascending: true });
    if (quotesError) throw quotesError;
    const todayQuotes = (todayQuotesRaw ?? []) as QuoteRow[];

    const bySymbol = new Map<string, QuoteRow[]>();
    for (const q of todayQuotes) {
      const list = bySymbol.get(q.symbol) ?? [];
      list.push(q);
      bySymbol.set(q.symbol, list);
    }

    // تا ۲۴۰ روز اخیر daily_candles هر نماد — برای حجم مشکوک (avg3m/avg12m) و توزیع پول درشت
    const candleResults = await Promise.all(
      symbols.map(async (symbol) => {
        const { data, error } = await client
          .from("daily_candles")
          .select("volume, buy_i_volume, buy_count_i, final_price, date")
          .eq("symbol", symbol)
          .order("date", { ascending: false })
          .limit(240);
        if (error) throw error;
        return [symbol, (data ?? []) as CandleSlice[]] as const;
      }),
    );
    const candlesBySymbol = new Map(candleResults);

    const metricRows: MetricRow[] = [];
    const moneyFlowRows: { symbol: string; moneyFlow: number | null }[] = [];

    for (const symbol of symbols) {
      const quotesForSymbol = bySymbol.get(symbol) ?? [];
      const latest = quotesForSymbol[quotesForSymbol.length - 1];
      if (!latest) continue;

      const buy = perCapitaBuy(latest);
      const sell = perCapitaSell(latest);
      const power = buyerPower(buy, sell);
      const flow = moneyFlow(latest);
      moneyFlowRows.push({ symbol, moneyFlow: flow });

      const candles = candlesBySymbol.get(symbol) ?? [];
      const suspicious = isSuspiciousVolume(latest.volume, candles.slice(0, 60), candles.slice(0, 240));

      const last30PerCapita = candles
        .slice(0, 30)
        .map((c) => perCapitaBuy({ buy_i_volume: c.buy_i_volume, close_price: c.final_price, buy_count_i: c.buy_count_i }));
      const whale = isWhaleBuyer(buy, last30PerCapita);

      const codeToCode = isCodeToCode(latest);
      const queue = queueState(latest);

      metricRows.push(
        { symbol, metric: "per_capita_buy", value: buy, meta: null, captured_at: latest.captured_at },
        { symbol, metric: "per_capita_sell", value: sell, meta: null, captured_at: latest.captured_at },
        { symbol, metric: "buyer_power", value: power, meta: null, captured_at: latest.captured_at },
        { symbol, metric: "money_flow", value: flow, meta: null, captured_at: latest.captured_at },
        {
          symbol,
          metric: "suspicious_volume",
          value: bool01(suspicious.suspicious),
          meta: { avg3m: suspicious.avg3m, avg12m: suspicious.avg12m },
          captured_at: latest.captured_at,
        },
        {
          symbol,
          metric: "whale",
          value: bool01(whale.isWhale),
          meta: { percentile90: whale.percentile90, sampleSize: whale.sampleSize },
          captured_at: latest.captured_at,
        },
        { symbol, metric: "code_to_code", value: bool01(codeToCode), meta: null, captured_at: latest.captured_at },
        { symbol, metric: "queue_locked_buy", value: bool01(queue.lockedBuy), meta: null, captured_at: latest.captured_at },
        { symbol, metric: "queue_heavy", value: bool01(queue.heavy), meta: null, captured_at: latest.captured_at },
      );

      if (quotesForSymbol.length >= 2) {
        const previous = quotesForSymbol[quotesForSymbol.length - 2];
        const velocity = queueVelocity(latest, previous);
        metricRows.push({
          symbol,
          metric: "queue_velocity",
          value: velocity.bidVolumeChange,
          meta: { askVolumeChange: velocity.askVolumeChange, secondsBetween: velocity.secondsBetween },
          captured_at: latest.captured_at,
        });
      }
    }

    // ورود/خروج پول به تفکیک صنعت
    const industryFlows = moneyFlowByIndustry(moneyFlowRows, industryOf);
    for (const [industry, total] of Object.entries(industryFlows)) {
      metricRows.push({ symbol: industry, metric: "money_flow_industry", value: total, meta: null, captured_at: capturedAt });
    }

    // سرانه تجمیعی بازار: هر «دور» جمع‌آوری (captured_at یکسان بین نمادها) یک نقطهٔ سری زمانی است
    const roundsMap = new Map<string, QuoteRow[]>();
    for (const q of todayQuotes) {
      const list = roundsMap.get(q.captured_at) ?? [];
      list.push(q);
      roundsMap.set(q.captured_at, list);
    }
    const series = [...roundsMap.entries()]
      .map(([roundCapturedAt, rows]) => {
        const { buyPerCapita, sellPerCapita } = marketPerCapita(rows);
        return { capturedAt: roundCapturedAt, buyPerCapita, sellPerCapita };
      })
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

    const latestRound = series[series.length - 1];
    if (latestRound) {
      metricRows.push(
        { symbol: "MARKET", metric: "market_buyer_per_capita", value: latestRound.buyPerCapita, meta: null, captured_at: latestRound.capturedAt },
        { symbol: "MARKET", metric: "market_seller_per_capita", value: latestRound.sellPerCapita, meta: null, captured_at: latestRound.capturedAt },
      );
    }

    // فقط کراس‌های «جدید» (۱۵ دقیقهٔ اخیر) ثبت می‌شوند تا هر اجرا کل روز را دوباره درج نکند
    const recentCutoff = new Date(now.getTime() - 15 * 60_000).toISOString();
    for (const event of detectCrossovers(series)) {
      if (event.capturedAt < recentCutoff) continue;
      metricRows.push({
        symbol: "MARKET",
        metric: "crossover",
        value: event.direction === "buy_over_sell" ? 1 : -1,
        meta: { direction: event.direction },
        captured_at: event.capturedAt,
      });
    }

    if (metricRows.length > 0) {
      const { error: insertError } = await client.from("tabloo_metrics").insert(metricRows);
      if (insertError) throw insertError;
    }

    const latencyMs = Math.round(performance.now() - start);
    await logHealth(client, "compute-tabloo", "ok", `${metricRows.length} metric rows`, latencyMs);

    return new Response(JSON.stringify({ ok: true, metrics: metricRows.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    await logHealth(client, "compute-tabloo", "error", message, latencyMs);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
