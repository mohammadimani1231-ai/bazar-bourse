import { createServerSupabaseClient } from "@/lib/supabase/serverClient.ts";
import type { SignalRow } from "@/components/SignalsTable";
import { calculatePositionSize, suggestStopLossFromAtr } from "@/lib/position-sizing.ts";
import { atr } from "@/lib/indicators.ts";
import { applyScreenerFilters, type ScreenerRow, type ScreenerFilters } from "@/lib/screenerFilters.ts";
import { buildVirtualPortfolioReport } from "@/lib/virtualPortfolioReport.ts";

/**
 * lib/chat/context.ts
 *
 * context-fetcher برای صفحهٔ سیگنال‌ها. هر تابع داده‌ی مربوط را به فرمت JSON
 * ساختاریافته (طبق چت‌بات spec v1، بخش 2) برمی‌گرداند. مدل LLM این JSON
 * را به عنوان context دریافت می‌کند.
 *
 * اصل: کوئری موازی نساز. هر تابع دقیقاً منابع خود را می‌خواند (بدون وابستگی متقاطع).
 */

export interface SignalReasonDetail {
  rule: string;
  triggered: boolean;
  contribution: number;
  detail: Record<string, unknown>;
}

export interface SignalsPageContextData {
  symbol?: string;
  direction: "buy" | "sell" | null;
  score: number;
  regime: string;
  reasons: SignalReasonDetail[];
  capturedAt: string;
}

/**
 * داده‌ی محل‌صاف صفحهٔ سیگنال‌ها برای یک نماد خاص.
 * اگر symbol null باشد، دو سیگنال اخیر (خریدی) را برمی‌گرداند (برای مثال در چت کلی).
 */
export async function getSignalsPageContext(
  symbol?: string | null,
): Promise<SignalsPageContextData | null> {
  const supabase = createServerSupabaseClient();

  // اگر symbol مشخص شده، صرفاً آخرین سیگنال آن نماد
  if (symbol) {
    const { data, error } = await supabase
      .from("signals")
      .select("id, symbol, direction, score, reasons, regime, created_at")
      .eq("symbol", symbol)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      symbol: data.symbol,
      direction: data.direction as "buy" | "sell",
      score: data.score,
      regime: data.regime,
      reasons: data.reasons ?? [],
      capturedAt: data.created_at,
    };
  }

  // اگر symbol نیست، دو سیگنال «خرید» اخیر برای مثال
  const { data, error } = await supabase
    .from("signals")
    .select("id, symbol, direction, score, reasons, regime, created_at")
    .eq("direction", "buy")
    .order("created_at", { ascending: false })
    .limit(2);

  if (error || !data || data.length === 0) {
    return null;
  }

  const latest = data[0];
  return {
    symbol: latest.symbol,
    direction: latest.direction as "buy" | "sell",
    score: latest.score,
    regime: latest.regime,
    reasons: latest.reasons ?? [],
    capturedAt: latest.created_at,
  };
}

/**
 * اطلاعات اندازهٔ پوزیشن پیشنهادی برای یک سیگنال خاص (صفحهٔ سیگنال‌ها).
 * این داده برای `proposePaperTrade` tool call استفاده می‌شود.
 */
export interface PositionSizingContextData {
  symbol: string;
  entryPrice: number;
  suggestedStopLoss: number;
  suggestedShareCount: number;
  capitalAtRisk: number;
  positionValue: number;
  warnings: string[];
  lastPrice: { price: number; capturedAt: string };
}

/**
 * Disclaimer متنِ استاندارد برای هر پاسخِ مرتبط با سیگنال/پوزیشن.
 * این تابع از داخل `/api/chat` صدا زده می‌شود، نه از پرامپت LLM.
 */
export function getSignalDisclaimerText(): string {
  return "این پاسخ قطعیت نداره و صرفاً بر پایه‌ی شواهد و سیگنال‌های موجود سیستم ارائه شده؛ تصمیم و مسئولیت نهایی خرید/فروش با خود شماست.";
}

export async function getPositionSizingContext(
  symbol: string,
  entryPrice: number,
): Promise<PositionSizingContextData | null> {
  const supabase = createServerSupabaseClient();

  // آخرین قیمت (برای ATR14 محاسبه)
  const { data: quoteData } = await supabase
    .from("quotes")
    .select("last_price, captured_at")
    .eq("symbol", symbol)
    .order("captured_at", { ascending: false })
    .limit(1)
    .single();

  if (!quoteData) {
    return null;
  }

  // کندل‌های ۳۰ روز آخر برای ATR14
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: candleData } = await supabase
    .from("daily_candles")
    .select("high, low, close, date")
    .eq("symbol", symbol)
    .gte("date", thirtyDaysAgo)
    .order("date", { ascending: false })
    .limit(30);

  // ATR14 محاسبه
  let suggestedStopLoss = entryPrice * 0.95; // پیش‌فرض: ۵٪
  if (candleData && candleData.length >= 14) {
    const highs = candleData.map((c: any) => c.high);
    const lows = candleData.map((c: any) => c.low);
    const closes = candleData.map((c: any) => c.close);
    const atrValues = atr(highs, lows, closes, 14);
    const lastAtrValue = atrValues[atrValues.length - 1];
    if (lastAtrValue && lastAtrValue > 0) {
      suggestedStopLoss = suggestStopLossFromAtr(entryPrice, lastAtrValue, 1.5);
    }
  }

  // تنظیمات ریسک
  const { data: riskSettings } = await supabase
    .from("risk_settings")
    .select("total_capital, max_risk_per_trade_pct, max_single_position_pct, regime_risk_multiplier")
    .eq("id", 1)
    .single();

  // رژیم
  const { data: settingsData } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "market_regime")
    .single();

  const regime = (settingsData?.value as string) ?? "normal";

  // محاسبهٔ اندازه
  if (riskSettings) {
    const result = calculatePositionSize({
      capital: riskSettings.total_capital,
      riskPerTradePct: riskSettings.max_risk_per_trade_pct,
      entryPrice,
      stopLossPrice: suggestedStopLoss,
      regime: regime as any,
      regimeMultiplier: riskSettings.regime_risk_multiplier ?? { normal: 1 },
      maxSinglePositionPct: riskSettings.max_single_position_pct,
    });

    return {
      symbol,
      entryPrice,
      suggestedStopLoss,
      suggestedShareCount: result.shareCount,
      capitalAtRisk: result.capitalAtRisk,
      positionValue: result.positionValue,
      warnings: result.warnings,
      lastPrice: { price: quoteData.last_price, capturedAt: quoteData.captured_at },
    };
  }

  return null;
}

/**
 * داده‌ی محل‌صاف صفحهٔ اسکرینر برای یک preset خاص یا تمام نتایج.
 * filterId=null یعنی بدون فیلتر (تمام نمادها).
 */
export interface ScreenerPageContextData {
  totalSymbols: number;
  filteredCount: number;
  presetName: string | null;
  presetCriteria: string;
  criteria: {
    rsiRange?: string;
    compositeRankRange?: string;
    moneyFlowRange?: string;
    buyerPowerRange?: string;
    tradeValueRange?: string;
  };
  topResults: Array<{
    symbol: string;
    compositeRank: number | null;
    rsi14: number | null;
    moneyFlow: number | null;
  }>;
}

export async function getScreenerPageContext(
  filterId: number | null,
  allRows: ScreenerRow[],
): Promise<ScreenerPageContextData | null> {
  const supabase = createServerSupabaseClient();

  let filters: ScreenerFilters | null = null;
  let presetName: string | null = null;

  if (filterId) {
    const { data } = await supabase
      .from("screener_presets")
      .select("name, filters")
      .eq("id", filterId)
      .single();

    if (data) {
      presetName = data.name;
      filters = data.filters;
    }
  }

  // فیلتر اعمال کن
  const filtered = filters ? applyScreenerFilters(allRows, filters) : allRows;

  // معیارها به فارسی
  const criteria: Record<string, string> = {};
  if (filters) {
    if (filters.rsi.min != null || filters.rsi.max != null) {
      const min = filters.rsi.min ?? "—";
      const max = filters.rsi.max ?? "—";
      criteria.rsiRange = `RSI۱۴: ${min} تا ${max}`;
    }
    if (filters.compositeRank.min != null || filters.compositeRank.max != null) {
      const min = filters.compositeRank.min ?? "—";
      const max = filters.compositeRank.max ?? "—";
      criteria.compositeRankRange = `رتبه مرکب: ${min} تا ${max}`;
    }
    if (filters.moneyFlow.min != null || filters.moneyFlow.max != null) {
      criteria.moneyFlowRange = `جریان پول: ${filters.moneyFlow.min ?? "—"} تا ${filters.moneyFlow.max ?? "—"}`;
    }
    if (filters.buyerPower.min != null || filters.buyerPower.max != null) {
      criteria.buyerPowerRange = `قدرت خریدار: ${filters.buyerPower.min ?? "—"} تا ${filters.buyerPower.max ?? "—"}`;
    }
    if (filters.tradeValue.min != null || filters.tradeValue.max != null) {
      criteria.tradeValueRange = `ارزش معاملات: ${filters.tradeValue.min ?? "—"} تا ${filters.tradeValue.max ?? "—"}`;
    }
  }

  // ۵ نتیجهٔ اول (مرتب‌شده با compositeRank)
  const topResults = filtered
    .sort((a, b) => (b.compositeRank ?? -1) - (a.compositeRank ?? -1))
    .slice(0, 5)
    .map((r) => ({
      symbol: r.symbol,
      compositeRank: r.compositeRank,
      rsi14: r.rsi14,
      moneyFlow: r.moneyFlow,
    }));

  return {
    totalSymbols: allRows.length,
    filteredCount: filtered.length,
    presetName,
    presetCriteria: presetName ? `فیلتر "${presetName}" اعمال شده` : "بدون فیلتر (تمام نمادها)",
    criteria,
    topResults,
  };
}

/**
 * داده‌ی محل‌صاف صفحهٔ پرتفوی برای ChatAssistant.
 */
export interface PortfolioPageContextData {
  totalCapital: number | null;
  capitalEngagedPct: number | null;
  totalOpenValue: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  openPositionsCount: number;
  closedPositionsCount: number;
  topOpenPositions: Array<{
    symbol: string;
    industry: string;
    unrealizedPnl: number | null;
    unrealizedPnlPct: number | null;
  }>;
  topClosedPositions: Array<{
    symbol: string;
    realizedPnl: number;
    realizedPnlPct: number | null;
  }>;
  topSectorConcentration: Array<{
    industry: string;
    pct: number | null;
  }>;
  stopLossBreachWarnings: Array<{
    symbol: string;
    distance: number;
  }>;
}

export async function getPortfolioPageContext(
  openPositions: Array<{
    symbol: string;
    industry: string;
    unrealizedPnl: number | null;
    unrealizedPnlPct: number | null;
    currentPrice: number | null;
    entryPrice: number;
    stopLoss: number | null;
    positionValue: number;
  }>,
  closedPositions: Array<{
    symbol: string;
    realizedPnl: number;
    realizedPnlPct: number | null;
  }>,
  sectorMap: Map<
    string,
    {
      value: number;
      pct: number | null;
    }
  >,
  totalCapital: number | null,
  totalUnrealizedPnl: number,
  totalRealizedPnl: number,
): Promise<PortfolioPageContextData | null> {
  const totalOpenValue = openPositions.reduce((sum, p) => sum + p.positionValue, 0);
  const capitalEngagedPct = totalCapital && totalCapital > 0 ? (totalOpenValue / totalCapital) * 100 : null;

  // ۳ پوزیشن باز با بیشترین/کمترین PnL
  const topOpenPositions = openPositions
    .sort((a, b) => {
      const aPnl = a.unrealizedPnl ?? 0;
      const bPnl = b.unrealizedPnl ?? 0;
      return Math.abs(bPnl) - Math.abs(aPnl);
    })
    .slice(0, 3)
    .map((p) => ({
      symbol: p.symbol,
      industry: p.industry,
      unrealizedPnl: p.unrealizedPnl,
      unrealizedPnlPct: p.unrealizedPnlPct,
    }));

  // ۳ معامله بسته‌شده با بیشترین/کمترین PnL
  const topClosedPositions = closedPositions
    .sort((a, b) => Math.abs(b.realizedPnl) - Math.abs(a.realizedPnl))
    .slice(0, 3)
    .map((p) => ({
      symbol: p.symbol,
      realizedPnl: p.realizedPnl,
      realizedPnlPct: p.realizedPnlPct,
    }));

  // ۳ صنعت با بیشترین تخصیص
  const topSectorConcentration = [...sectorMap.entries()]
    .map(([industry, { pct }]) => ({ industry, pct }))
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
    .slice(0, 3);

  // پوزیشن‌هایی که به حد ضرر نزدیک‌اند (فاصلهٔ قیمت < ۵٪)
  const stopLossBreachWarnings = openPositions
    .filter((p) => p.currentPrice != null && p.stopLoss != null)
    .map((p) => {
      const distance = ((p.currentPrice! - p.stopLoss!) / p.stopLoss!) * 100;
      return { symbol: p.symbol, distance };
    })
    .filter((w) => w.distance < 5 && w.distance > 0)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);

  return {
    totalCapital,
    capitalEngagedPct,
    totalOpenValue,
    totalUnrealizedPnl,
    totalRealizedPnl,
    openPositionsCount: openPositions.length,
    closedPositionsCount: closedPositions.length,
    topOpenPositions,
    topClosedPositions,
    topSectorConcentration,
    stopLossBreachWarnings,
  };
}

/**
 * داده‌ی محل‌صاف صفحهٔ کارنامهٔ عملکرد برای ChatAssistant.
 */
export interface PerformancePageContextData {
  hasData: boolean;
  totalTrades: number;
  totalReturnPct: number | null;
  winRatePct: number | null;
  winRateAdequate: boolean;
  profitFactor: number | null;
  profitFactorAdequate: boolean;
  maxDrawdownPct: number;
  sharpePct: number | null;
  sharpeAdequate: boolean;
  cagrPct: number | null;
  cagrAdequate: boolean;
  avgHoldingDays: number | null;
  benchmarkComparisonSummary: Array<{
    benchmarkName: string;
    benchmarkReturnPct: number | null;
    outperformancePct: number | null;
  }>;
  insufficientDataReasons: string[];
}

export async function getPerformancePageContext(): Promise<PerformancePageContextData | null> {
  const supabase = createServerSupabaseClient();
  const report = await buildVirtualPortfolioReport(supabase);
  const { metrics, benchmarkComparison } = report;

  const hasData = report.allTrades.length > 0;
  if (!hasData) {
    return {
      hasData: false,
      totalTrades: 0,
      totalReturnPct: null,
      winRatePct: null,
      winRateAdequate: false,
      profitFactor: null,
      profitFactorAdequate: false,
      maxDrawdownPct: 0,
      sharpePct: null,
      sharpeAdequate: false,
      cagrPct: null,
      cagrAdequate: false,
      avgHoldingDays: null,
      benchmarkComparisonSummary: [],
      insufficientDataReasons: ["هنوز هیچ سیگنالی در پرتفوی مجازی اجرا نشده"],
    };
  }

  const insufficientReasons: string[] = [];
  if (!metrics.sampleAdequate) {
    insufficientReasons.push(`نمونه کمتر از ۲۰ معامله (فقط ${metrics.totalTrades} تا ثبت شده)`);
  }
  if (metrics.sharpe == null) {
    insufficientReasons.push("دوره کمتر از ۹۰ روز برای Sharpe");
  }
  if (metrics.cagrPct == null) {
    insufficientReasons.push("دوره کمتر از یک سال برای CAGR");
  }

  const benchmarkSummary = benchmarkComparison.map((b) => ({
    benchmarkName: b.label,
    benchmarkReturnPct: b.benchmarkReturnPct,
    outperformancePct:
      metrics.totalReturnPct != null && b.benchmarkReturnPct != null
        ? metrics.totalReturnPct - b.benchmarkReturnPct
        : null,
  }));

  return {
    hasData: true,
    totalTrades: metrics.totalTrades,
    totalReturnPct: metrics.totalReturnPct,
    winRatePct: metrics.sampleAdequate ? metrics.winRatePct : null,
    winRateAdequate: metrics.sampleAdequate,
    profitFactor: metrics.sampleAdequate && Number.isFinite(metrics.profitFactor) ? metrics.profitFactor : null,
    profitFactorAdequate: metrics.sampleAdequate && Number.isFinite(metrics.profitFactor),
    maxDrawdownPct: metrics.maxDrawdownPct,
    sharpePct: metrics.sharpe,
    sharpeAdequate: metrics.sharpe != null,
    cagrPct: metrics.cagrPct,
    cagrAdequate: metrics.cagrPct != null,
    avgHoldingDays: metrics.avgHoldingDays,
    benchmarkComparisonSummary: benchmarkSummary,
    insufficientDataReasons: insufficientReasons,
  };
}
