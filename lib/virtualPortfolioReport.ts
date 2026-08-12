import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "./supabase/fetchAllPages.ts";
import { buildVirtualEquityCurve, type EquityCurveTrade } from "./virtualEquityCurve.ts";
import {
  comparePortfolioToBenchmarks,
  computePortfolioMetrics,
  evaluateHorizons,
  evaluateTrade,
  DEFAULT_HORIZONS_DAYS,
  type BenchmarkSeries,
  type ClosedVirtualTrade,
  type HorizonResult,
  type PortfolioBenchmarkComparison,
  type PortfolioMetrics,
  type TradePerformance,
} from "./virtualPerformance.ts";
import type { EquityPoint } from "./tradeMetrics.ts";
import {
  labelOutcome,
  summarizeLabels,
  type OutcomeLabel,
  type OutcomeLabelResult,
  type TensionPoint,
} from "./outcomeLabels.ts";

/**
 * لایهٔ گردآوری دادهٔ موتور عملکرد پرتفوی مجازی (بخش ۲): از DB می‌خواند و توابع خالص
 * lib/virtualPerformance.ts و lib/virtualEquityCurve.ts را صدا می‌زند. خودش هیچ محاسبهٔ
 * متریکی ندارد (قید #۳) و هیچ نوشتنی انجام نمی‌دهد (قید #۱۴: جریان یک‌طرفه).
 */

export interface VirtualTradeRow {
  id: number;
  signal_id: number;
  symbol: string;
  status: string;
  status_note: string | null;
  signal_at: string;
  signal_price: number | null;
  signal_tension_gauge: number | null;
  entry_at: string | null;
  entry_price: number | null;
  share_count: number | null;
  entry_fee: number | null;
  queue_wait_days: number;
  exit_at: string | null;
  exit_price: number | null;
  exit_fee: number | null;
  exit_reason: string | null;
  realized_pnl: number | null;
  return_pct: number | null;
}

export interface VirtualPortfolioReport {
  initialCapital: number;
  /** null یعنی هنوز هیچ معامله‌ای اجرا نشده — لایهٔ نمایش باید حالت خالی نشان دهد. */
  startedAt: string | null;
  metrics: PortfolioMetrics;
  equityPoints: EquityPoint[];
  benchmarkCurves: { label: string; points: EquityPoint[] }[];
  benchmarkComparison: PortfolioBenchmarkComparison[];
  tradePerformances: TradePerformance[];
  horizons: HorizonResult[];
  /** شمارش وضعیت همهٔ رکوردها — پایهٔ گزارش «چند سیگنال اجرا/رد/در انتظار شد». */
  statusCounts: Record<string, number>;
  /** برچسب علت نتیجه (بخش ۳) برای هر رکورد، به کلید id. */
  outcomeLabels: Map<number, OutcomeLabelResult>;
  /** توزیع برچسب‌ها روی همهٔ رکوردها. */
  labelCounts: Record<OutcomeLabel, number>;
  openTrades: VirtualTradeRow[];
  allTrades: VirtualTradeRow[];
}

/** تاریخچهٔ روزانهٔ گِیج تنش — آخرین مقدار هر روز، مبنای آستانهٔ پرسنتایلی بخش ۳. */
async function fetchTensionHistory(client: SupabaseClient): Promise<TensionPoint[]> {
  const rows = await fetchAllPages<{ price: number | null; captured_at: string }>(async (from, to) => {
    const { data } = await client
      .from("global_quotes")
      .select("price, captured_at")
      .eq("asset", "tension_index")
      .order("captured_at", { ascending: true })
      .range(from, to);
    return (data ?? []) as { price: number | null; captured_at: string }[];
  });

  const lastByDate = new Map<string, number>();
  for (const r of rows) {
    if (r.price == null) continue;
    lastByDate.set(r.captured_at.slice(0, 10), Number(r.price));
  }
  return [...lastByDate].map(([date, gaugeValue]) => ({ date, gaugeValue })).sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchBenchmarkSeries(client: SupabaseClient, asset: string): Promise<BenchmarkSeries> {
  const rows = await fetchAllPages<{ date: string; close: number | null }>(async (from, to) => {
    const { data } = await client
      .from("benchmark_candles")
      .select("date, close")
      .eq("asset", asset)
      .order("date", { ascending: true })
      .range(from, to);
    return (data ?? []) as { date: string; close: number | null }[];
  });
  return { points: rows.filter((r) => r.close != null).map((r) => ({ date: r.date, close: Number(r.close) })) };
}

async function fetchSymbolSeries(client: SupabaseClient, symbol: string): Promise<BenchmarkSeries> {
  const rows = await fetchAllPages<{ date: string; final_price: number | null }>(async (from, to) => {
    const { data } = await client
      .from("daily_candles")
      .select("date, final_price")
      .eq("symbol", symbol)
      .order("date", { ascending: true })
      .range(from, to);
    return (data ?? []) as { date: string; final_price: number | null }[];
  });
  return {
    points: rows.filter((r) => r.final_price != null).map((r) => ({ date: r.date, close: Number(r.final_price) })),
  };
}

/** بنچمارک را روی همان سرمایهٔ اولیه هم‌مقیاس می‌کند تا با منحنی پرتفوی قابل مقایسه باشد. */
function rebaseToEquity(series: BenchmarkSeries, calendar: string[], initialCapital: number): EquityPoint[] {
  const byDate = new Map(series.points.map((p) => [p.date, p.close]));
  let base: number | null = null;
  let last: number | null = null;
  const points: EquityPoint[] = [];

  for (const date of calendar) {
    const close: number | null = byDate.get(date) ?? last;
    if (close == null) continue;
    last = close;
    if (base == null) base = close;
    points.push({ date, equity: (close / base) * initialCapital });
  }
  return points;
}

export async function buildVirtualPortfolioReport(
  client: SupabaseClient,
  horizons: number[] = DEFAULT_HORIZONS_DAYS,
): Promise<VirtualPortfolioReport> {
  const { data: portfolioRow } = await client
    .from("virtual_portfolio")
    .select("initial_capital, started_at")
    .eq("id", 1)
    .maybeSingle();
  const initialCapital = Number(portfolioRow?.initial_capital ?? 100_000_000);

  const allTrades = await fetchAllPages<VirtualTradeRow>(async (from, to) => {
    const { data } = await client
      .from("virtual_trades")
      .select(
        "id, signal_id, symbol, status, status_note, signal_at, signal_price, signal_tension_gauge, entry_at, entry_price, share_count, entry_fee, queue_wait_days, exit_at, exit_price, exit_fee, exit_reason, realized_pnl, return_pct",
      )
      .order("signal_at", { ascending: true })
      .range(from, to);
    return (data ?? []) as VirtualTradeRow[];
  });

  const statusCounts: Record<string, number> = {};
  for (const t of allTrades) statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;

  const executed = allTrades.filter((t) => t.entry_at != null && t.entry_price != null && t.share_count != null);
  const openTrades = executed.filter((t) => t.status !== "closed");
  const closed = executed.filter((t) => t.status === "closed" && t.exit_at != null && t.exit_price != null);

  const symbols = [...new Set(executed.map((t) => t.symbol))];
  const symbolSeries = new Map<string, BenchmarkSeries>();
  for (const symbol of symbols) {
    symbolSeries.set(symbol, await fetchSymbolSeries(client, symbol));
  }

  const tedpix = await fetchBenchmarkSeries(client, "tedpix");
  const tedpixEqualWeight = await fetchBenchmarkSeries(client, "tedpix_equal_weight");

  // تقویم: از اولین ورود واقعی تا امروز، بر پایهٔ روزهای معاملاتی شاخص کل.
  const firstEntryDate = executed.reduce<string | null>((min, t) => {
    const d = t.entry_at!.slice(0, 10);
    return min == null || d < min ? d : min;
  }, null);
  const calendar = firstEntryDate == null ? [] : tedpix.points.filter((p) => p.date >= firstEntryDate).map((p) => p.date);

  const curveTrades: EquityCurveTrade[] = executed.map((t) => ({
    symbol: t.symbol,
    entryDate: t.entry_at!.slice(0, 10),
    entryPrice: Number(t.entry_price),
    shareCount: Number(t.share_count),
    entryFee: Number(t.entry_fee ?? 0),
    exitDate: t.exit_at?.slice(0, 10) ?? null,
    exitPrice: t.exit_price == null ? null : Number(t.exit_price),
    exitFee: t.exit_fee == null ? null : Number(t.exit_fee),
  }));

  const closesBySymbol = new Map(
    [...symbolSeries].map(([symbol, s]) => [symbol, new Map(s.points.map((p) => [p.date, p.close]))]),
  );
  const { points: equityPoints, capitalDeployedRatioByDate } = buildVirtualEquityCurve(
    curveTrades,
    initialCapital,
    calendar,
    closesBySymbol,
  );

  const closedTrades: ClosedVirtualTrade[] = closed.map((t) => ({
    symbol: t.symbol,
    entryAt: t.entry_at!,
    exitAt: t.exit_at!,
    entryPrice: Number(t.entry_price),
    exitPrice: Number(t.exit_price),
    shareCount: Number(t.share_count),
    pnl: Number(t.realized_pnl ?? 0),
    returnPct: Number(t.return_pct ?? 0),
  }));

  const tradePerformances = closedTrades.map((t) =>
    evaluateTrade(t, { tedpix, tedpixEqualWeight, symbol: symbolSeries.get(t.symbol) }),
  );

  const metrics = computePortfolioMetrics({
    trades: tradePerformances,
    equityPoints,
    initialCapital,
    capitalDeployedRatioByDate,
  });

  const buyAndHoldValues = tradePerformances
    .map((t) => t.buyAndHoldPct)
    .filter((v): v is number => v != null);
  const avgBuyAndHold =
    buyAndHoldValues.length > 0 ? buyAndHoldValues.reduce((a, b) => a + b, 0) / buyAndHoldValues.length : null;

  const benchmarkComparison =
    calendar.length > 0
      ? comparePortfolioToBenchmarks(
          metrics.totalReturnPct,
          calendar[0],
          calendar[calendar.length - 1],
          { tedpix, tedpixEqualWeight },
          avgBuyAndHold,
        )
      : [];

  const tensionHistory = await fetchTensionHistory(client);
  const outcomeLabels = new Map<number, OutcomeLabelResult>();
  for (const t of allTrades) {
    outcomeLabels.set(
      t.id,
      labelOutcome(
        {
          status: t.status,
          queueWaitDays: Number(t.queue_wait_days ?? 0),
          pnl: t.realized_pnl == null ? null : Number(t.realized_pnl),
          entryDate: t.entry_at?.slice(0, 10) ?? null,
          exitDate: t.exit_at?.slice(0, 10) ?? null,
        },
        tensionHistory,
      ),
    );
  }

  return {
    initialCapital,
    startedAt: firstEntryDate,
    metrics,
    outcomeLabels,
    labelCounts: summarizeLabels([...outcomeLabels.values()].map((l) => l.label)),
    equityPoints,
    benchmarkCurves: [
      { label: "شاخص کل", points: rebaseToEquity(tedpix, calendar, initialCapital) },
      { label: "شاخص هم‌وزن", points: rebaseToEquity(tedpixEqualWeight, calendar, initialCapital) },
    ],
    benchmarkComparison,
    tradePerformances,
    horizons: evaluateHorizons(
      allTrades.map((t) => ({ signalAt: t.signal_at, symbol: t.symbol })),
      symbolSeries,
      horizons,
    ),
    statusCounts,
    openTrades,
    allTrades,
  };
}
