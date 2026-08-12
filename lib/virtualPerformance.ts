import {
  averageLoss,
  averageWin,
  bestTrade,
  equityReturns,
  expectancy,
  maxDrawdown,
  profitFactor,
  sharpeRatio,
  winRatePct,
  worstTrade,
  type EquityPoint,
} from "./tradeMetrics.ts";

/**
 * موتور محاسبهٔ عملکرد پرتفوی مجازی (بخش ۲) — همهٔ توابع خالص‌اند و متریک‌های پایه را از
 * lib/tradeMetrics.ts می‌گیرند (همان تعاریفی که بک‌تست استفاده می‌کند، قید #۳).
 *
 * اصل حاکم بر این ماژول: **عدد بدون زمینه ندهیم.** هر معیاری که روی نمونهٔ کوچک بی‌معنا
 * می‌شود (Sharpe، CAGR) به‌جای عدد گمراه‌کننده مقدار null با دلیل برمی‌گرداند و لایهٔ نمایش
 * باید «دادهٔ کافی نیست» بنویسد.
 */

/** حداقل تعداد معاملهٔ بسته‌شده برای اینکه win rate/profit factor اصلاً گزارش شود. */
export const MIN_TRADES_FOR_RATIOS = 20;
/** حداقل طول دوره (روز تقویمی) برای اینکه Sharpe سالانه‌سازی‌شده معنا داشته باشد. */
export const MIN_DAYS_FOR_SHARPE = 90;
/** حداقل طول دوره برای اینکه CAGR (بازده مرکب سالانه) گزارش شود. */
export const MIN_DAYS_FOR_CAGR = 365;

export const DEFAULT_HORIZONS_DAYS = [7, 30, 90];

export interface ClosedVirtualTrade {
  symbol: string;
  entryAt: string;
  exitAt: string;
  entryPrice: number;
  exitPrice: number;
  shareCount: number;
  /** سود/زیان خالص بعد از هر دو کارمزد (از lib/virtualExecution.ts::realizedPnl). */
  pnl: number;
  returnPct: number;
}

export interface BenchmarkSeries {
  /** سری تاریخ→قیمت پایانی، مرتب‌شده صعودی. */
  points: { date: string; close: number }[];
}

/** بازده یک سری بین دو تاریخ؛ نزدیک‌ترین تاریخِ کوچک‌تر-مساوی انتخاب می‌شود. */
export function seriesReturnPct(series: BenchmarkSeries, fromDate: string, toDate: string): number | null {
  const startClose = closeAtOrBefore(series, fromDate);
  const endClose = closeAtOrBefore(series, toDate);
  if (startClose == null || endClose == null || startClose <= 0) return null;
  return (endClose / startClose - 1) * 100;
}

function closeAtOrBefore(series: BenchmarkSeries, date: string): number | null {
  let lo = 0;
  let hi = series.points.length - 1;
  let found: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series.points[mid].date <= date) {
      found = series.points[mid].close;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export interface TradeBenchmarks {
  /** شاخص کل هم‌دوره. */
  tedpixPct: number | null;
  /** شاخص هم‌وزن هم‌دوره. */
  tedpixEqualWeightPct: number | null;
  /**
   * Buy & Hold همان سهم در همان بازه — مهارت «انتخاب سهم» را از مهارت «زمان‌بندی» جدا می‌کند:
   * اگر بازده معامله از این کمتر باشد، یعنی زمان‌بندی ورود/خروج ارزش منفی داشته.
   */
  buyAndHoldPct: number | null;
}

export interface TradePerformance extends TradeBenchmarks {
  trade: ClosedVirtualTrade;
  holdingDays: number;
  excessVsTedpixPct: number | null;
  excessVsEqualWeightPct: number | null;
  excessVsBuyAndHoldPct: number | null;
}

export function evaluateTrade(
  trade: ClosedVirtualTrade,
  benchmarks: { tedpix?: BenchmarkSeries; tedpixEqualWeight?: BenchmarkSeries; symbol?: BenchmarkSeries },
): TradePerformance {
  const from = trade.entryAt.slice(0, 10);
  const to = trade.exitAt.slice(0, 10);

  const tedpixPct = benchmarks.tedpix ? seriesReturnPct(benchmarks.tedpix, from, to) : null;
  const tedpixEqualWeightPct = benchmarks.tedpixEqualWeight
    ? seriesReturnPct(benchmarks.tedpixEqualWeight, from, to)
    : null;
  // Buy & Hold عمداً ناخالص از کارمزد نیست: همان یک بار خرید و یک بار فروش را دارد، پس با
  // بازده خالص معامله هم‌مقیاس می‌ماند و مقایسه منصفانه است.
  const buyAndHoldPct = benchmarks.symbol ? seriesReturnPct(benchmarks.symbol, from, to) : null;

  return {
    trade,
    holdingDays: Math.max(0, Math.round((Date.parse(trade.exitAt) - Date.parse(trade.entryAt)) / 86_400_000)),
    tedpixPct,
    tedpixEqualWeightPct,
    buyAndHoldPct,
    excessVsTedpixPct: tedpixPct == null ? null : trade.returnPct - tedpixPct,
    excessVsEqualWeightPct: tedpixEqualWeightPct == null ? null : trade.returnPct - tedpixEqualWeightPct,
    excessVsBuyAndHoldPct: buyAndHoldPct == null ? null : trade.returnPct - buyAndHoldPct,
  };
}

export interface HorizonResult {
  horizonDays: number;
  evaluated: number;
  avgReturnPct: number | null;
  winRatePct: number | null;
}

export interface SignalHorizonInput {
  signalAt: string;
  symbol: string;
}

/**
 * ارزیابی چندافقی: بازده فرضی هر سیگنال در افق‌های ثابت، **مستقل از خروج واقعی پرتفوی**.
 * ورود فرضی با قیمت پایانی اولین روز معاملاتی بعد از سیگنال (ضد look-ahead، عیناً همان
 * قرارداد supabase/functions/evaluate-signal-outcomes).
 */
export function evaluateHorizons(
  signals: SignalHorizonInput[],
  seriesBySymbol: Map<string, BenchmarkSeries>,
  horizons: number[] = DEFAULT_HORIZONS_DAYS,
): HorizonResult[] {
  return horizons.map((horizonDays) => {
    const returns: number[] = [];

    for (const signal of signals) {
      const series = seriesBySymbol.get(signal.symbol);
      if (!series) continue;
      const signalDate = signal.signalAt.slice(0, 10);
      const entryIndex = series.points.findIndex((p) => p.date > signalDate);
      if (entryIndex === -1) continue;

      const entry = series.points[entryIndex];
      const target = new Date(Date.parse(entry.date) + horizonDays * 86_400_000).toISOString().slice(0, 10);
      const exitClose = closeAtOrBefore(series, target);
      // اگر هنوز به افق نرسیده‌ایم، این سیگنال در این افق شمرده نمی‌شود (نه صفر فرض شود).
      const lastDate = series.points[series.points.length - 1].date;
      if (exitClose == null || entry.close <= 0 || lastDate < target) continue;

      returns.push((exitClose / entry.close - 1) * 100);
    }

    if (returns.length === 0) {
      return { horizonDays, evaluated: 0, avgReturnPct: null, winRatePct: null };
    }
    return {
      horizonDays,
      evaluated: returns.length,
      avgReturnPct: returns.reduce((a, b) => a + b, 0) / returns.length,
      winRatePct: (returns.filter((r) => r > 0).length / returns.length) * 100,
    };
  });
}

export interface PortfolioMetrics {
  totalTrades: number;
  /** برای شفافیت: معیارهای نسبتی روی نمونهٔ کوچک قابل اتکا نیستند. */
  sampleAdequate: boolean;
  periodDays: number;
  /**
   * null یعنی هنوز هیچ پوزیشنی باز نشده و منحنی سرمایه‌ای وجود ندارد. عمداً صفر نیست:
   * «۰٪ بازده» یعنی «معامله کردیم و به جایی نرسیدیم»، در حالی که واقعیت «هنوز شروع نکرده‌ایم»
   * است — دو چیز کاملاً متفاوت که نباید یک عدد نشان داده شوند.
   */
  totalReturnPct: number | null;
  winRatePct: number;
  profitFactor: number;
  expectancy: number;
  averageWin: number | null;
  averageLoss: number | null;
  bestTradePct: number | null;
  worstTradePct: number | null;
  maxDrawdownPct: number;
  avgHoldingDays: number | null;
  /** ٪ میانگین سرمایهٔ درگیر — همان معیار تحلیل dilution بک‌تست. */
  avgCapitalDeployedPct: number | null;
  /** فقط وقتی دوره به حداقل معنادار رسیده باشد؛ وگرنه null → «دادهٔ کافی نیست». */
  sharpe: number | null;
  cagrPct: number | null;
  notes: string[];
}

export interface PortfolioMetricsInput {
  trades: TradePerformance[];
  equityPoints: EquityPoint[];
  initialCapital: number;
  /** نسبت سرمایهٔ درگیر در هر روز (۰ تا ۱) — اگر در دسترس نباشد null. */
  capitalDeployedRatioByDate?: { date: string; ratio: number }[];
}

export function computePortfolioMetrics(input: PortfolioMetricsInput): PortfolioMetrics {
  const { trades, equityPoints, initialCapital } = input;
  const raw = trades.map((t) => t.trade);
  const notes: string[] = [];

  const periodDays =
    equityPoints.length >= 2
      ? Math.max(
          0,
          Math.round(
            (Date.parse(equityPoints[equityPoints.length - 1].date) - Date.parse(equityPoints[0].date)) / 86_400_000,
          ),
        )
      : 0;

  const finalEquity = equityPoints.length > 0 ? equityPoints[equityPoints.length - 1].equity : initialCapital;
  const totalReturnPct =
    equityPoints.length === 0 || initialCapital <= 0 ? null : (finalEquity / initialCapital - 1) * 100;
  if (totalReturnPct == null) {
    notes.push("هنوز هیچ پوزیشنی باز نشده — منحنی سرمایه‌ای وجود ندارد و بازده گزارش نمی‌شود (این با «بازده صفر» یکی نیست).");
  }

  const sampleAdequate = raw.length >= MIN_TRADES_FOR_RATIOS;
  if (!sampleAdequate) {
    notes.push(
      `فقط ${raw.length} معاملهٔ بسته‌شده — کمتر از حداقل ${MIN_TRADES_FOR_RATIOS} معامله؛ نسبت‌ها (win rate، profit factor) روی این نمونه آماری قابل اتکا نیستند.`,
    );
  }

  let sharpe: number | null = null;
  if (periodDays >= MIN_DAYS_FOR_SHARPE) {
    sharpe = sharpeRatio(equityReturns(equityPoints));
  } else {
    notes.push(`دورهٔ فعالیت فقط ${periodDays} روز است — Sharpe زیر ${MIN_DAYS_FOR_SHARPE} روز گزارش نمی‌شود.`);
  }

  let cagrPct: number | null = null;
  if (periodDays >= MIN_DAYS_FOR_CAGR && initialCapital > 0 && finalEquity > 0) {
    cagrPct = ((finalEquity / initialCapital) ** (365 / periodDays) - 1) * 100;
  } else {
    notes.push(`دورهٔ فعالیت به ${MIN_DAYS_FOR_CAGR} روز نرسیده — CAGR گزارش نمی‌شود.`);
  }

  const holdingDays = trades.map((t) => t.holdingDays);
  const deployed = input.capitalDeployedRatioByDate ?? [];

  return {
    totalTrades: raw.length,
    sampleAdequate,
    periodDays,
    totalReturnPct,
    winRatePct: winRatePct(raw),
    profitFactor: profitFactor(raw),
    expectancy: expectancy(raw),
    averageWin: averageWin(raw),
    averageLoss: averageLoss(raw),
    bestTradePct: bestTrade(raw)?.returnPct ?? null,
    worstTradePct: worstTrade(raw)?.returnPct ?? null,
    maxDrawdownPct: maxDrawdown(equityPoints).maxDrawdownPct,
    avgHoldingDays:
      holdingDays.length > 0 ? holdingDays.reduce((a, b) => a + b, 0) / holdingDays.length : null,
    avgCapitalDeployedPct:
      deployed.length > 0 ? (deployed.reduce((s, d) => s + d.ratio, 0) / deployed.length) * 100 : null,
    sharpe,
    cagrPct,
    notes,
  };
}

export interface PortfolioBenchmarkComparison {
  label: string;
  portfolioReturnPct: number;
  benchmarkReturnPct: number | null;
  excessPct: number | null;
}

/** مقایسهٔ کل پرتفوی با هر سه بنچمارک در بازهٔ فعالیت. */
export function comparePortfolioToBenchmarks(
  portfolioReturnPct: number,
  fromDate: string,
  toDate: string,
  benchmarks: { tedpix?: BenchmarkSeries; tedpixEqualWeight?: BenchmarkSeries },
  avgBuyAndHoldPct: number | null,
): PortfolioBenchmarkComparison[] {
  const rows: PortfolioBenchmarkComparison[] = [];

  const add = (label: string, benchmarkReturnPct: number | null) => {
    rows.push({
      label,
      portfolioReturnPct,
      benchmarkReturnPct,
      excessPct: benchmarkReturnPct == null ? null : portfolioReturnPct - benchmarkReturnPct,
    });
  };

  add("شاخص کل", benchmarks.tedpix ? seriesReturnPct(benchmarks.tedpix, fromDate, toDate) : null);
  add(
    "شاخص هم‌وزن",
    benchmarks.tedpixEqualWeight ? seriesReturnPct(benchmarks.tedpixEqualWeight, fromDate, toDate) : null,
  );
  add("میانگین Buy & Hold همان سهام", avgBuyAndHoldPct);

  return rows;
}
