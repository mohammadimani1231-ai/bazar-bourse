import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/serverClient.ts";
import { tehranDayBounds } from "@/lib/time/tehranDay.ts";
import { formatFaNumber } from "@/lib/format.ts";
import { PriceHeader } from "@/components/PriceHeader";
import type { CandlePoint, SignalMarker, NewsMarker } from "@/components/CandleChart";
import type { IntradayPoint } from "@/components/IntradayFlowChart";
import type { QueueFlagsData } from "@/components/QueueFlags";
import type { SignalHistoryItem } from "@/components/SignalHistoryList";
import { GenerateSymbolReportButton } from "@/components/GenerateSymbolReportButton";
import { SymbolTabs } from "@/components/SymbolTabs";

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
      .select("last_price, close_price, price_max, price_min, captured_at")
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
  // نزدیک‌ترین کندل بستهٔ قبلی (دیروز، چون کندل امروز تا پایان جلسه ساخته نمی‌شود) — برای
  // درصد تغییر هدر قیمت (الگوی Yahoo Finance)، نه از خود quotes امروز.
  const previousClose = candlesRaw?.[0]?.close ?? null;

  return (
    <div className="flex flex-col gap-4">
      <PriceHeader
        symbol={symbol}
        industry={watchlistRow.industry ?? null}
        initial={{
          lastPrice: latestQuote?.last_price ?? null,
          closePrice: latestQuote?.close_price ?? null,
          capturedAt: latestQuote?.captured_at ?? null,
        }}
        previousClose={previousClose}
      />

      <div className="flex items-center justify-between">
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
          <div className="flex justify-between gap-4">
            <span className="text-muted">قیمت پایانی روز قبل</span>
            <span className="ltr-nums font-bold">{formatFaNumber(previousClose)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted">سقف/کف مجاز امروز</span>
            <span className="ltr-nums font-bold">
              {formatFaNumber(latestQuote?.price_max ?? null)} / {formatFaNumber(latestQuote?.price_min ?? null)}
            </span>
          </div>
        </div>
        <GenerateSymbolReportButton symbol={symbol} />
      </div>

      <SymbolTabs
        candles={candles}
        signalMarkers={signalMarkers}
        newsMarkers={newsMarkers}
        intradayPoints={intradayPoints}
        queueFlags={queueFlags}
        signalHistoryItems={signalHistoryItems}
      />
    </div>
  );
}
