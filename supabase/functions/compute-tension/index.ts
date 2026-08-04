import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { dailyPctChanges, zScore, coinBubblePct, computeTensionIndex } from "../../../lib/tension.ts";
import { downsampleToDaily } from "../../../lib/downsampleDaily.ts";

/**
 * هر ۱۵ دقیقه، مستقل از ساعات بازار تهران (دلار/طلا/برنت ۲۴/۷ حرکت می‌کنند):
 * z-score نوسان دلار آزاد (نسبت به ۹۰ روز benchmark_candles) + حباب سکه امامی (نسبت به
 * ارزش ذاتی طلا) + z-score تغییر برنت (نسبت به تاریخچهٔ global_quotes خودش) → میانگین →
 * gauge ۰-۱۰۰ در global_quotes با asset='tension_index'.
 */
Deno.serve(async () => {
  const start = performance.now();
  const client = createServiceClient();

  try {
    const capturedAt = new Date().toISOString();

    async function latestQuote(asset: string): Promise<number | null> {
      const { data } = await client
        .from("global_quotes")
        .select("price")
        .eq("asset", asset)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.price ?? null;
    }

    const [usdIrrLive, coinEmamiLive, goldOunceLive, brentLive] = await Promise.all([
      latestQuote("usd_irr"),
      latestQuote("coin_emami"),
      latestQuote("gold_ounce"),
      latestQuote("brent"),
    ]);

    // مؤلفهٔ ۱: z-score نوسان دلار آزاد — baseline از تاریخچهٔ عمیق benchmark_candles،
    // مقدار «امروز» از global_quotes زنده (benchmark_candles روزانه به‌روز نمی‌شود)
    const { data: usdHistoryRaw } = await client
      .from("benchmark_candles")
      .select("date, close")
      .eq("asset", "usd_irr")
      .order("date", { ascending: false })
      .limit(91);
    const usdHistory = (usdHistoryRaw ?? []).slice().reverse(); // قدیم→جدید

    let usdVolatilityZ: number | null = null;
    if (usdIrrLive != null && usdHistory.length >= 11) {
      const closes = usdHistory.map((r) => r.close as number);
      const lastClose = closes[closes.length - 1];
      const baselineAbsChanges = dailyPctChanges(closes.slice(0, -1)).map(Math.abs);
      const todayAbsChange = Math.abs(((usdIrrLive - lastClose) / lastClose) * 100);
      usdVolatilityZ = zScore(todayAbsChange, baselineAbsChanges);
    }

    // مؤلفهٔ ۲: حباب سکه — فقط به مقادیر «امروز» نیاز دارد، تاریخچه لازم نیست
    const coinBubble = coinBubblePct(coinEmamiLive, goldOunceLive, usdIrrLive);

    // مؤلفهٔ ۳: z-score تغییر برنت — baseline از تاریخچهٔ global_quotes خودش (روزانه‌شده)
    const { data: brentHistoryRaw } = await client
      .from("global_quotes")
      .select("price, captured_at")
      .eq("asset", "brent")
      .order("captured_at", { ascending: true })
      .limit(1000);
    const brentDaily = downsampleToDaily(
      (brentHistoryRaw ?? []).map((r) => ({ value: r.price, captured_at: r.captured_at })),
    );

    let brentChangeZ: number | null = null;
    if (brentLive != null && brentDaily.length >= 11) {
      const closes = brentDaily.map((r) => r.value);
      const lastClose = closes[closes.length - 1];
      const baselineChanges = dailyPctChanges(closes.slice(0, -1));
      const todayChange = ((brentLive - lastClose) / lastClose) * 100;
      brentChangeZ = zScore(todayChange, baselineChanges);
    }

    const { gaugeValue } = computeTensionIndex({ usdVolatilityZ, coinBubblePct: coinBubble, brentChangeZ });

    if (gaugeValue != null) {
      const { error: insertError } = await client.from("global_quotes").insert({
        asset: "tension_index",
        price: gaugeValue,
        change_pct: null,
        captured_at: capturedAt,
      });
      if (insertError) throw insertError;
    }

    const latencyMs = Math.round(performance.now() - start);
    await logHealth(
      client,
      "compute-tension",
      "ok",
      gaugeValue == null ? "insufficient data" : `gauge=${gaugeValue.toFixed(1)}`,
      latencyMs,
    );

    return new Response(JSON.stringify({ ok: true, gaugeValue, usdVolatilityZ, coinBubble, brentChangeZ }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    await logHealth(client, "compute-tension", "error", message, latencyMs);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
