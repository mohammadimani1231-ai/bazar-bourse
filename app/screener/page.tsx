import { createServerSupabaseClient } from "@/lib/supabase/serverClient.ts";
import { computeRawScore, percentileRank } from "@/lib/composite-rank.ts";
import { distanceFromHigh, THREE_MONTH_TRADING_DAYS, ONE_YEAR_TRADING_DAYS } from "@/lib/priceExtremes.ts";
import type { ScreenerRow } from "@/lib/screenerFilters.ts";
import { ScreenerClient, type PresetRow } from "@/components/ScreenerClient";

// دیتای زنده (قیمت/پول/سیگنال) — نباید در build-time prerender و freeze شود
export const dynamic = "force-dynamic";

const CANDLE_WINDOW_DAYS = 450; // >= ۳۰۰ روز معاملاتی برای هر نماد فعال، با حاشیهٔ امن برای تعطیلات
const CANDLES_PER_SYMBOL = 300;
const PAGE_SIZE = 1000; // سقف پیش‌فرض PostgREST

interface CandleCloseRow {
  symbol: string;
  date: string;
  adjusted_close: number | null;
  final_price: number | null;
}

interface RecentCandleData {
  /** برای RSI/رتبهٔ مرکب — تعدیل‌شده، همان مصرف قبلی. */
  adjustedCloses: Map<string, number[]>;
  /** برای فاصله تا سقف ۳ماهه/سالانه (فاز D) — عمداً قیمت پایانی خام، نه تعدیل‌شده، چون این
   * عدد باید همان چیزی باشد که در tsetmc دیده می‌شود. */
  finalPriceCloses: Map<string, number[]>;
}

/**
 * یک کوئری دسته‌ای (صفحه‌بندی‌شده به‌خاطر سقف ۱۰۰۰ ردیفی PostgREST) به‌جای یک کوئری جدا
 * به‌ازای هر نماد watchlist — قبلاً روی هر بار لود صفحه به تعداد نمادها (الان ۴۵) درخواست
 * موازی جدا به Supabase می‌رفت.
 */
async function fetchRecentCloses(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  cutoffDate: string,
): Promise<RecentCandleData> {
  const adjustedCloses = new Map<string, number[]>();
  const finalPriceCloses = new Map<string, number[]>();
  let from = 0;
  for (;;) {
    const { data } = await supabase
      .from("daily_candles")
      .select("symbol, date, adjusted_close, final_price")
      .gte("date", cutoffDate)
      .order("date", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    const page = (data ?? []) as CandleCloseRow[];
    for (const row of page) {
      if (row.adjusted_close != null) {
        const list = adjustedCloses.get(row.symbol) ?? [];
        list.push(row.adjusted_close);
        adjustedCloses.set(row.symbol, list);
      }
      if (row.final_price != null) {
        const list = finalPriceCloses.get(row.symbol) ?? [];
        list.push(row.final_price);
        finalPriceCloses.set(row.symbol, list);
      }
    }
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  // ردیف‌ها صعودی بر تاریخ خوانده شدند؛ فقط N تای آخر هر نماد لازم است (هم‌ارز limit(300) قبلی)
  for (const [symbol, closes] of adjustedCloses) {
    if (closes.length > CANDLES_PER_SYMBOL) adjustedCloses.set(symbol, closes.slice(-CANDLES_PER_SYMBOL));
  }
  for (const [symbol, closes] of finalPriceCloses) {
    if (closes.length > CANDLES_PER_SYMBOL) finalPriceCloses.set(symbol, closes.slice(-CANDLES_PER_SYMBOL));
  }
  return { adjustedCloses, finalPriceCloses };
}

export default async function ScreenerPage() {
  const supabase = createServerSupabaseClient();

  const [{ data: watchlist }, { data: quotesRaw }, { data: tablooRaw }, { data: presetsRaw }] = await Promise.all([
    supabase.from("watchlist").select("symbol, industry, company_name"),
    supabase.from("quotes").select("symbol, value, last_price, captured_at").order("captured_at", { ascending: false }).limit(200),
    supabase
      .from("tabloo_metrics")
      .select("symbol, metric, value, captured_at")
      .in("metric", ["buyer_power", "money_flow", "suspicious_volume"])
      .order("captured_at", { ascending: false })
      .limit(600),
    supabase.from("screener_presets").select("id, name, filters").order("created_at", { ascending: false }),
  ]);

  const symbols = (watchlist ?? []).map((w) => w.symbol as string);
  const industryOf = new Map((watchlist ?? []).map((w) => [w.symbol, w.industry ?? "سایر"]));
  const companyNameOf = new Map((watchlist ?? []).map((w) => [w.symbol, w.company_name as string | null]));

  const tradeValueBySymbol = new Map<string, number>();
  const lastPriceBySymbol = new Map<string, number>();
  for (const q of quotesRaw ?? []) {
    if (!tradeValueBySymbol.has(q.symbol) && q.value != null) tradeValueBySymbol.set(q.symbol, q.value);
    if (!lastPriceBySymbol.has(q.symbol) && q.last_price != null) lastPriceBySymbol.set(q.symbol, q.last_price);
  }

  const latestMetric = new Map<string, Map<string, number | null>>();
  for (const row of tablooRaw ?? []) {
    const bySymbol = latestMetric.get(row.symbol) ?? new Map<string, number | null>();
    if (!bySymbol.has(row.metric)) bySymbol.set(row.metric, row.value);
    latestMetric.set(row.symbol, bySymbol);
  }

  const candleCutoffDate = new Date(new Date().getTime() - CANDLE_WINDOW_DAYS * 24 * 60 * 60_000).toISOString().slice(0, 10);
  const { adjustedCloses: closesBySymbol, finalPriceCloses } = await fetchRecentCloses(supabase, candleCutoffDate);
  const candleResults = symbols.map(
    (symbol) => [symbol, computeRawScore(closesBySymbol.get(symbol) ?? [])] as const,
  );
  const rawScoreBySymbol = new Map(candleResults);
  const ranked = percentileRank(
    candleResults.map(([symbol, r]) => ({ symbol, rawScore: r.rawScore })),
  );
  const rankBySymbol = new Map(ranked.map((r) => [r.symbol, r.rank]));

  const rows: ScreenerRow[] = symbols.map((symbol) => {
    const metrics = latestMetric.get(symbol);
    const scoreResult = rawScoreBySymbol.get(symbol);
    const finalPrices = finalPriceCloses.get(symbol) ?? [];
    const currentPrice = lastPriceBySymbol.get(symbol) ?? null;
    return {
      symbol,
      companyName: companyNameOf.get(symbol) ?? null,
      industry: industryOf.get(symbol) ?? "سایر",
      tradeValue: tradeValueBySymbol.get(symbol) ?? null,
      rsi14: scoreResult?.components.rsi14 ?? null,
      compositeRank: rankBySymbol.get(symbol) ?? null,
      maDistancePct: scoreResult?.components.distFromEma50Pct ?? null,
      distanceFromHigh3mPct: distanceFromHigh(currentPrice, finalPrices, THREE_MONTH_TRADING_DAYS).distancePct,
      distanceFromHigh1yPct: distanceFromHigh(currentPrice, finalPrices, ONE_YEAR_TRADING_DAYS).distancePct,
      buyerPower: metrics?.get("buyer_power") ?? null,
      moneyFlow: metrics?.get("money_flow") ?? null,
      suspiciousVolume: metrics?.get("suspicious_volume") == null ? null : metrics.get("suspicious_volume") === 1,
      recentCloses: (closesBySymbol.get(symbol) ?? []).slice(-20),
    };
  });

  const presets: PresetRow[] = (presetsRaw ?? []).map((p) => ({ id: p.id, name: p.name, filters: p.filters }));

  return (
    <div className="flex flex-col gap-4">
      <ScreenerClient rows={rows} industries={[...new Set(symbols.map((s) => industryOf.get(s)!))]} presets={presets} />
    </div>
  );
}
