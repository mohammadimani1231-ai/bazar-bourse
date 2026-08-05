import { createServerSupabaseClient } from "@/lib/supabase/serverClient.ts";
import { computeRawScore, percentileRank } from "@/lib/composite-rank.ts";
import type { ScreenerRow } from "@/lib/screenerFilters.ts";
import { ScreenerClient, type PresetRow, type FilterBounds } from "@/components/ScreenerClient";

// دیتای زنده (قیمت/پول/سیگنال) — نباید در build-time prerender و freeze شود
export const dynamic = "force-dynamic";

function bounds(values: number[], fallback: [number, number]): [number, number] {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return fallback;
  return [Math.min(...valid), Math.max(...valid)];
}

export default async function ScreenerPage() {
  const supabase = createServerSupabaseClient();

  const [{ data: watchlist }, { data: quotesRaw }, { data: tablooRaw }, { data: presetsRaw }] = await Promise.all([
    supabase.from("watchlist").select("symbol, industry, company_name"),
    supabase.from("quotes").select("symbol, value, captured_at").order("captured_at", { ascending: false }).limit(200),
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
  for (const q of quotesRaw ?? []) {
    if (!tradeValueBySymbol.has(q.symbol) && q.value != null) tradeValueBySymbol.set(q.symbol, q.value);
  }

  const latestMetric = new Map<string, Map<string, number | null>>();
  for (const row of tablooRaw ?? []) {
    const bySymbol = latestMetric.get(row.symbol) ?? new Map<string, number | null>();
    if (!bySymbol.has(row.metric)) bySymbol.set(row.metric, row.value);
    latestMetric.set(row.symbol, bySymbol);
  }

  const candleResults = await Promise.all(
    symbols.map(async (symbol) => {
      const { data } = await supabase
        .from("daily_candles")
        .select("adjusted_close")
        .eq("symbol", symbol)
        .order("date", { ascending: false })
        .limit(300);
      const closes = (data ?? [])
        .map((r) => r.adjusted_close)
        .filter((v): v is number => v != null)
        .reverse();
      return [symbol, computeRawScore(closes)] as const;
    }),
  );
  const rawScoreBySymbol = new Map(candleResults);
  const ranked = percentileRank(
    candleResults.map(([symbol, r]) => ({ symbol, rawScore: r.rawScore })),
  );
  const rankBySymbol = new Map(ranked.map((r) => [r.symbol, r.rank]));

  const rows: ScreenerRow[] = symbols.map((symbol) => {
    const metrics = latestMetric.get(symbol);
    const scoreResult = rawScoreBySymbol.get(symbol);
    return {
      symbol,
      companyName: companyNameOf.get(symbol) ?? null,
      industry: industryOf.get(symbol) ?? "سایر",
      tradeValue: tradeValueBySymbol.get(symbol) ?? null,
      rsi14: scoreResult?.components.rsi14 ?? null,
      compositeRank: rankBySymbol.get(symbol) ?? null,
      maDistancePct: scoreResult?.components.distFromEma50Pct ?? null,
      buyerPower: metrics?.get("buyer_power") ?? null,
      moneyFlow: metrics?.get("money_flow") ?? null,
      suspiciousVolume: metrics?.get("suspicious_volume") == null ? null : metrics.get("suspicious_volume") === 1,
    };
  });

  const filterBounds: FilterBounds = {
    tradeValue: bounds(rows.map((r) => r.tradeValue ?? NaN), [0, 1]),
    rsi: [0, 100],
    compositeRank: bounds(rows.map((r) => r.compositeRank ?? NaN), [0, 99]),
    maDistance: bounds(rows.map((r) => r.maDistancePct ?? NaN), [-20, 20]),
    buyerPower: bounds(rows.map((r) => r.buyerPower ?? NaN), [0, 5]),
    moneyFlow: bounds(rows.map((r) => r.moneyFlow ?? NaN), [-1, 1]),
  };

  const presets: PresetRow[] = (presetsRaw ?? []).map((p) => ({ id: p.id, name: p.name, filters: p.filters }));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold">اسکرینر</h1>
      <ScreenerClient rows={rows} industries={[...new Set(symbols.map((s) => industryOf.get(s)!))]} bounds={filterBounds} presets={presets} />
    </div>
  );
}
