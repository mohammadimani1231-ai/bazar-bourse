import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { checkMarketOpen } from "../_shared/marketStatus.ts";
import { ema, rsi, distanceFrom52Week } from "../../../lib/indicators.ts";
import { perCapitaBuy, perCapitaSell, buyerPower, moneyFlow, isSuspiciousVolume } from "../../../lib/tabloo.ts";
import { evaluateSignal, type SignalContext, type SignalRule } from "../../../lib/signal-engine.ts";

const HISTORY_ROWS = 300;

interface CandleRow {
  date: string;
  adjusted_close: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  final_price: number | null;
  buy_i_volume: number | null;
  sell_i_volume: number | null;
  buy_count_i: number | null;
  sell_count_i: number | null;
}

/**
 * هر ۱۰ دقیقه در ساعات بازار: از تاریخچهٔ daily_candles (کندل بسته‌شده — ضد repainting)
 * اندیکاتورها و متریک‌های تابلوخوانی هر نماد را می‌سازد، قوانین فعال signal_rules را روی آن
 * اجرا می‌کند (lib/signal-engine.ts — همان کدی که scripts/backtest.ts هم import می‌کند)،
 * و در صورت رسیدن به آستانه، در جدول signals ثبت می‌کند.
 */
Deno.serve(async () => {
  const start = performance.now();
  const client = createServiceClient();

  try {
    const marketStatus = await checkMarketOpen(client);
    if (!marketStatus.open) {
      const latencyMs = Math.round(performance.now() - start);
      await logHealth(client, "compute-signals", "market_closed", marketStatus.reason, latencyMs);
      return new Response(JSON.stringify({ ok: true, skipped: "market_closed", reason: marketStatus.reason }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: watchlist, error: watchlistError } = await client.from("watchlist").select("symbol");
    if (watchlistError) throw watchlistError;
    const symbols = (watchlist ?? []).map((w) => w.symbol as string);

    const { data: rulesRaw, error: rulesError } = await client
      .from("signal_rules")
      .select("name, definition, weight, enabled")
      .eq("enabled", true);
    if (rulesError) throw rulesError;
    const rules = (rulesRaw ?? []) as SignalRule[];

    const inserted: { symbol: string; direction: string; score: number }[] = [];

    for (const symbol of symbols) {
      const { data: candlesDesc, error: candlesError } = await client
        .from("daily_candles")
        .select("date, adjusted_close, high, low, volume, final_price, buy_i_volume, sell_i_volume, buy_count_i, sell_count_i")
        .eq("symbol", symbol)
        .order("date", { ascending: false })
        .limit(HISTORY_ROWS);
      if (candlesError) throw candlesError;
      if (!candlesDesc || candlesDesc.length === 0) continue;

      const candles = [...candlesDesc].reverse() as CandleRow[];
      const closes = candles.map((c) => c.adjusted_close).filter((v): v is number => v != null);
      if (closes.length < 27) continue; // کمترین طول لازم برای EMA26 معنادار

      const ema9 = ema(closes, 9);
      const ema26 = ema(closes, 26);
      const rsi14 = rsi(closes, 14);
      const n = closes.length;

      const last = candles[candles.length - 1];
      const highs = candles.map((c) => c.high).filter((v): v is number => v != null);
      const lows = candles.map((c) => c.low).filter((v): v is number => v != null);
      const { pctFromHigh, pctFromLow } = distanceFrom52Week(closes[n - 1], highs, lows);

      const lastQuoteLike = {
        buy_i_volume: last.buy_i_volume,
        sell_i_volume: last.sell_i_volume,
        buy_count_i: last.buy_count_i,
        sell_count_i: last.sell_count_i,
        close_price: last.final_price,
      };
      const buy = perCapitaBuy(lastQuoteLike);
      const sell = perCapitaSell(lastQuoteLike);
      const power = buyerPower(buy, sell);
      const moneyFlowHistory = candles
        .slice(-3)
        .map((c) =>
          moneyFlow({ buy_i_volume: c.buy_i_volume, sell_i_volume: c.sell_i_volume, close_price: c.final_price }),
        );

      // میانگین‌ها از روزهای قبل از last گرفته می‌شود، نه شامل خودش (والا با خودش مقایسه می‌شد)
      const before = candles.slice(0, -1);
      const suspicious = isSuspiciousVolume(last.volume, before.slice(-60), before.slice(-240));

      const { data: rankRow } = await client
        .from("composite_rank")
        .select("rank")
        .eq("symbol", symbol)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: queueRow } = await client
        .from("tabloo_metrics")
        .select("value")
        .eq("symbol", symbol)
        .eq("metric", "queue_locked_buy")
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const ctx: SignalContext = {
        series: {
          EMA9: { current: ema9[n - 1], previous: ema9[n - 2] ?? null },
          EMA26: { current: ema26[n - 1], previous: ema26[n - 2] ?? null },
        },
        metrics: {
          rsi14: rsi14[n - 1],
          buyer_power: power,
          suspicious_volume: suspicious.suspicious,
          pct_from_52w_high: pctFromHigh,
          pct_from_52w_low: pctFromLow,
          composite_rank: rankRow?.rank ?? null,
        },
        history: {
          money_flow: moneyFlowHistory,
        },
        queueLocked: queueRow?.value === 1,
      };

      const evaluation = evaluateSignal(rules, ctx, true);
      if (evaluation.direction === "none") continue;

      const { error: insertError } = await client.from("signals").insert({
        symbol,
        direction: evaluation.direction,
        score: evaluation.score,
        reasons: evaluation.reasons,
        regime: "normal",
      });
      if (insertError) throw insertError;
      inserted.push({ symbol, direction: evaluation.direction, score: evaluation.score });
    }

    const latencyMs = Math.round(performance.now() - start);
    await logHealth(client, "compute-signals", "ok", `${inserted.length} signals`, latencyMs);

    return new Response(JSON.stringify({ ok: true, signals: inserted }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    await logHealth(client, "compute-signals", "error", message, latencyMs);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
