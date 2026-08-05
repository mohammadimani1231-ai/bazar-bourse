import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/serverClient.ts";
import { tehranDayBounds } from "@/lib/time/tehranDay.ts";
import { PriceHeader } from "@/components/PriceHeader";
import { CandleChart, type CandlePoint, type SignalMarker, type NewsMarker } from "@/components/CandleChart";
import { IntradayFlowChart, type IntradayPoint } from "@/components/IntradayFlowChart";
import { QueueFlags, type QueueFlagsData } from "@/components/QueueFlags";
import { SignalHistoryList, type SignalHistoryItem } from "@/components/SignalHistoryList";
import { GenerateSymbolReportButton } from "@/components/GenerateSymbolReportButton";

// دیتای زنده (قیمت/پول/سیگنال) — نباید در build-time prerender و freeze شود
export const dynamic = "force-dynamic";

export default async function SymbolPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol: symbolParam } = await params;
  const symbol = decodeURIComponent(symbolParam);
  const supabase = createServerSupabaseClient();
  const { startUtc: dayStartUtc } = tehranDayBounds(new Date());
  const nowIso = new Date().toISOString();

  const [
    { data: watchlistRow },
    { data: latestQuoteRows },
    { data: candlesRaw },
    { data: signalsRaw },
    { data: todayMetricsRaw },
    { data: newsRaw },
  ] = await Promise.all([
    supabase.from("watchlist").select("symbol, industry").eq("symbol", symbol).maybeSingle(),
    supabase
      .from("quotes")
      .select("last_price, close_price, captured_at")
      .eq("symbol", symbol)
      .order("captured_at", { ascending: false })
      .limit(1),
    supabase
      .from("daily_candles")
      .select("date, open, high, low, close, adjusted_close")
      .eq("symbol", symbol)
      .order("date", { ascending: false })
      .limit(400),
    supabase
      .from("signals")
      .select("id, direction, score, reasons, created_at")
      .eq("symbol", symbol)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("tabloo_metrics")
      .select("metric, value, meta, captured_at")
      .eq("symbol", symbol)
      .gte("captured_at", dayStartUtc)
      .lte("captured_at", nowIso)
      .order("captured_at", { ascending: true }),
    supabase
      .from("news_items")
      .select("title, url, published_at")
      .order("published_at", { ascending: false })
      .limit(200),
  ]);

  if (!watchlistRow) notFound();

  const candles: CandlePoint[] = (candlesRaw ?? [])
    .map((c) => ({ date: c.date, open: c.open, high: c.high, low: c.low, close: c.close }))
    .reverse();

  const signals = signalsRaw ?? [];
  const signalMarkers: SignalMarker[] = signals
    .filter((s) => s.direction === "buy" || s.direction === "sell")
    .map((s) => ({ date: s.created_at.slice(0, 10), direction: s.direction }));

  const newsMarkers: NewsMarker[] = (newsRaw ?? [])
    .filter((n) => n.published_at)
    .map((n) => ({ date: n.published_at!.slice(0, 10), title: n.title, url: n.url }));

  const signalHistoryItems: SignalHistoryItem[] = signals.map((s) => ({
    id: s.id,
    direction: s.direction,
    createdAt: s.created_at,
    reasons: s.reasons,
  }));

  const metricsByType = new Map<string, { value: number | null; capturedAt: string }[]>();
  for (const row of todayMetricsRaw ?? []) {
    const list = metricsByType.get(row.metric) ?? [];
    list.push({ value: row.value, capturedAt: row.captured_at });
    metricsByType.set(row.metric, list);
  }
  const latestOf = (metric: string): number | null => {
    const list = metricsByType.get(metric);
    return list && list.length > 0 ? list[list.length - 1].value : null;
  };
  const boolOf = (metric: string): boolean | null => {
    const v = latestOf(metric);
    return v == null ? null : v === 1;
  };

  const timeline = new Map<string, IntradayPoint>();
  const ensure = (t: string) => {
    if (!timeline.has(t)) {
      timeline.set(t, { capturedAt: t, perCapitaBuy: null, perCapitaSell: null, buyerPower: null, moneyFlow: null });
    }
    return timeline.get(t)!;
  };
  for (const [metric, points] of metricsByType) {
    for (const p of points) {
      const point = ensure(p.capturedAt);
      if (metric === "per_capita_buy") point.perCapitaBuy = p.value;
      if (metric === "per_capita_sell") point.perCapitaSell = p.value;
      if (metric === "buyer_power") point.buyerPower = p.value;
      if (metric === "money_flow") point.moneyFlow = p.value;
    }
  }
  const intradayPoints = [...timeline.values()];

  const queueFlags: QueueFlagsData = {
    lockedBuy: boolOf("queue_locked_buy"),
    heavy: boolOf("queue_heavy"),
    queueVelocity: latestOf("queue_velocity"),
    suspiciousVolume: boolOf("suspicious_volume"),
    whale: boolOf("whale"),
    codeToCode: boolOf("code_to_code"),
  };

  const latestQuote = latestQuoteRows?.[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <PriceHeader
        symbol={symbol}
        initial={{
          lastPrice: latestQuote?.last_price ?? null,
          closePrice: latestQuote?.close_price ?? null,
          capturedAt: latestQuote?.captured_at ?? null,
        }}
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">صنعت: {watchlistRow.industry ?? "نامشخص"}</p>
        <GenerateSymbolReportButton symbol={symbol} />
      </div>

      <div className="rounded-lg border border-border bg-surface p-3">
        <h2 className="mb-2 text-sm font-bold">کندل روزانه</h2>
        {candles.length > 0 ? (
          <>
            <CandleChart candles={candles} signalMarkers={signalMarkers} newsMarkers={newsMarkers} />
            <p className="mt-2 text-[11px] text-muted">
              فلش سبز/قرمز = سیگنال خرید/فروش، دایرهٔ آبی «خبر» = رویداد ژئوپلیتیک/اقتصادی (کل بازار، نه لزوماً این نماد) — کلیک برای لینک.
            </p>
          </>
        ) : (
          <p className="text-xs text-muted">هنوز کندلی برای این نماد ثبت نشده.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-3">
          <h2 className="mb-2 text-sm font-bold">سری‌زمانی درون‌روز</h2>
          <IntradayFlowChart points={intradayPoints} />
        </div>
        <div className="flex flex-col gap-4">
          <QueueFlags data={queueFlags} />
          <SignalHistoryList items={signalHistoryItems} />
        </div>
      </div>
    </div>
  );
}
