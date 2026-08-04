/**
 * بک‌تست ۵ ساله — عیناً از lib/indicators.ts، lib/composite-rank.ts، lib/tabloo.ts و
 * lib/signal-engine.ts استفاده می‌کند (قاعدهٔ طلایی فاز ۳: هیچ پیاده‌سازی موازی).
 *
 * استفاده: npm run backtest -- --from 2021-01-01 [--rules default]
 *
 * فرضیات مستندشده (چون در پرامپت صریح نبود):
 * - اندازهٔ پوزیشن: ۱۰٪ سرمایهٔ فعلی به هر معامله، حداکثر ۱۰ پوزیشن هم‌زمان
 * - خروج: سیگنال sell همان نماد، یا حداکثر ۲۰ روز معاملاتی نگه‌داری (هرکدام زودتر)
 * - قید صف در ورود: اگر روز ورود هم صف‌قفل بود (close==high، تقریب چون tmax تاریخی نداریم)،
 *   تا ۳ روز بعد امتحان می‌شود؛ وگرنه معامله از دست می‌رود
 * - کارمزد ۱.۵٪ رفت‌وبرگشت به‌صورت ضریب یک‌جا روی بازده هر معامله اعمال می‌شود
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ema, rsi, distanceFrom52Week } from "../lib/indicators.ts";
import { computeRawScore, percentileRank } from "../lib/composite-rank.ts";
import { perCapitaBuy, perCapitaSell, buyerPower, moneyFlow, isSuspiciousVolume } from "../lib/tabloo.ts";
import { evaluateSignal, type SignalContext, type SignalRule } from "../lib/signal-engine.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const ALLOCATION_PCT = 0.1;
const MAX_CONCURRENT_POSITIONS = 10;
const MAX_HOLD_DAYS = 20;
const ROUND_TRIP_FEE = 0.015;
const QUEUE_RETRY_DAYS = 3;

function loadEnvLocal(): Record<string, string> {
  const envPath = path.join(ROOT, ".env.local");
  const values: Record<string, string> = {};
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const idx = trimmed.indexOf("=");
      values[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  } catch {
    // فایل نیست، فقط process.env استفاده می‌شود
  }
  return values;
}

function parseArgs(argv: string[]): { from: string; rules: string } {
  let from = "2021-01-01";
  let rules = "default";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from" && argv[i + 1]) from = argv[++i];
    if (argv[i] === "--rules" && argv[i + 1]) rules = argv[++i];
  }
  return { from, rules };
}

interface CandleRow {
  symbol: string;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  final_price: number | null;
  volume: number | null;
  adjusted_close: number | null;
  buy_i_volume: number | null;
  sell_i_volume: number | null;
  buy_count_i: number | null;
  sell_count_i: number | null;
}

interface BenchmarkRow {
  asset: string;
  date: string;
  close: number | null;
}

async function fetchAll<T>(
  supabaseUrl: string,
  serviceKey: string,
  table: string,
  select: string,
  extraParams: Record<string, string> = {},
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const params = new URLSearchParams({ select, ...extraParams });
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${params.toString()}`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Range: `${from}-${from + pageSize - 1}`,
      },
    });
    if (!res.ok) throw new Error(`${table} fetch failed: ${res.status} ${await res.text()}`);
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

interface SymbolSeries {
  symbol: string;
  candles: CandleRow[]; // صعودی بر تاریخ، کل تاریخچه
  closes: number[]; // adjusted_close موازی با candles
  ema9: number[];
  ema26: number[];
  rsi14: (number | null)[];
  highs: number[];
  lows: number[];
}

function buildSeries(symbol: string, candles: CandleRow[]): SymbolSeries {
  const closes = candles.map((c) => c.adjusted_close ?? c.close ?? 0);
  return {
    symbol,
    candles,
    closes,
    ema9: ema(closes, 9),
    ema26: ema(closes, 26),
    rsi14: rsi(closes, 14),
    highs: candles.map((c) => c.high ?? 0),
    lows: candles.map((c) => c.low ?? 0),
  };
}

interface DailySignal {
  symbol: string;
  date: string;
  direction: "buy" | "sell" | "none";
  score: number;
  reasons: { rule: string; triggered: boolean; contribution: number }[];
}

function isQueueLocked(candle: CandleRow): boolean {
  return candle.close != null && candle.high != null && candle.close === candle.high;
}

interface Trade {
  symbol: string;
  signalDate: string;
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  exitReason: "sell_signal" | "max_hold" | "end_of_backtest";
  returnPct: number;
  pnl: number;
  allocated: number;
}

interface OpenPosition {
  symbol: string;
  signalDate: string;
  entryIndex: number;
  entryDate: string;
  entryPrice: number;
  allocated: number;
}

async function main() {
  const { from, rules: rulesArg } = parseArgs(process.argv.slice(2));
  const env = { ...loadEnvLocal(), ...process.env };
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY باید در .env.local باشند.");
    process.exit(1);
  }
  if (rulesArg !== "default") {
    console.error(`فقط --rules default پشتیبانی می‌شود (قوانین فعال فعلی signal_rules). دریافت شد: ${rulesArg}`);
    process.exit(1);
  }

  console.log(`بک‌تست از ${from}، قوانین: ${rulesArg}`);

  const watchlistRows = await fetchAll<{ symbol: string }>(supabaseUrl, serviceKey, "watchlist", "symbol");
  const symbols = watchlistRows.map((w) => w.symbol);
  console.log(`${symbols.length} نماد`);

  const rulesRaw = await fetchAll<SignalRule>(
    supabaseUrl,
    serviceKey,
    "signal_rules",
    "name,definition,weight,enabled",
    { enabled: "eq.true" },
  );
  console.log(`${rulesRaw.length} قانون فعال`);

  console.log("دریافت daily_candles هر نماد...");
  const seriesBySymbol = new Map<string, SymbolSeries>();
  for (const symbol of symbols) {
    const candles = await fetchAll<CandleRow>(
      supabaseUrl,
      serviceKey,
      "daily_candles",
      "symbol,date,open,high,low,close,final_price,volume,adjusted_close,buy_i_volume,sell_i_volume,buy_count_i,sell_count_i",
      { symbol: `eq.${symbol}`, order: "date.asc" },
    );
    if (candles.length > 0) seriesBySymbol.set(symbol, buildSeries(symbol, candles));
  }

  console.log("دریافت benchmark_candles...");
  const benchmarkRows = await fetchAll<BenchmarkRow>(
    supabaseUrl,
    serviceKey,
    "benchmark_candles",
    "asset,date,close",
    { order: "date.asc" },
  );
  const benchmarksByAsset = new Map<string, BenchmarkRow[]>();
  for (const row of benchmarkRows) {
    const list = benchmarksByAsset.get(row.asset) ?? [];
    list.push(row);
    benchmarksByAsset.set(row.asset, list);
  }

  // تقویم معاملاتی مشترک: اجتماع تاریخ‌های همهٔ نمادها از from به بعد
  const calendarSet = new Set<string>();
  for (const series of seriesBySymbol.values()) {
    for (const c of series.candles) {
      if (c.date >= from) calendarSet.add(c.date);
    }
  }
  const calendar = [...calendarSet].sort();
  console.log(`${calendar.length} روز معاملاتی از ${from}`);

  // ایندکس هر نماد در هر روز تقویم (برای دسترسی سریع به closes.slice(0, i+1))
  const dateIndexBySymbol = new Map<string, Map<string, number>>();
  for (const [symbol, series] of seriesBySymbol) {
    const map = new Map<string, number>();
    series.candles.forEach((c, i) => map.set(c.date, i));
    dateIndexBySymbol.set(symbol, map);
  }

  const allSignals: DailySignal[] = [];
  const openPositions = new Map<string, OpenPosition>();
  const trades: Trade[] = [];
  const equityPoints: { date: string; equity: number }[] = [];
  let equity = 1_000_000; // واحد دلخواه، فقط نسبی مهم است

  function closePosition(symbol: string, exitIndex: number, reason: Trade["exitReason"]) {
    const pos = openPositions.get(symbol);
    if (!pos) return;
    const series = seriesBySymbol.get(symbol)!;
    const exitCandle = series.candles[exitIndex];
    const exitPrice = exitCandle.open ?? exitCandle.close ?? pos.entryPrice;
    const rawReturn = exitPrice / pos.entryPrice;
    const netReturn = rawReturn * (1 - ROUND_TRIP_FEE) - 1;
    const pnl = pos.allocated * netReturn;
    equity += pnl;
    trades.push({
      symbol,
      signalDate: pos.signalDate,
      entryDate: pos.entryDate,
      entryPrice: pos.entryPrice,
      exitDate: exitCandle.date,
      exitPrice,
      exitReason: reason,
      returnPct: netReturn * 100,
      pnl,
      allocated: pos.allocated,
    });
    openPositions.delete(symbol);
  }

  for (const date of calendar) {
    // ۱. رتبهٔ مرکب امروز برای همهٔ نمادهایی که امروز کندل دارند (مقطعی، مثل compute-rank زنده)
    const rawScores: { symbol: string; rawScore: number | null }[] = [];
    for (const [symbol, series] of seriesBySymbol) {
      const idx = dateIndexBySymbol.get(symbol)!.get(date);
      if (idx == null) continue;
      const { rawScore } = computeRawScore(series.closes.slice(0, idx + 1));
      rawScores.push({ symbol, rawScore });
    }
    const ranked = percentileRank(rawScores);
    const rankBySymbol = new Map(ranked.map((r) => [r.symbol, r.rank]));

    // ۲. برای هر نماد، سیگنال امروز را بساز (دقیقاً منطق compute-signals، با داده کندل بسته)
    for (const [symbol, series] of seriesBySymbol) {
      const idx = dateIndexBySymbol.get(symbol)!.get(date);
      if (idx == null || idx < 26) continue;

      const last = series.candles[idx];
      const closesToDate = series.closes.slice(0, idx + 1);
      const { pctFromHigh, pctFromLow } = distanceFrom52Week(
        closesToDate[closesToDate.length - 1],
        series.highs.slice(0, idx + 1),
        series.lows.slice(0, idx + 1),
      );

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
      const moneyFlowHistory = series.candles
        .slice(Math.max(0, idx - 2), idx + 1)
        .map((c) => moneyFlow({ buy_i_volume: c.buy_i_volume, sell_i_volume: c.sell_i_volume, close_price: c.final_price }));

      const beforeToday = series.candles.slice(0, idx);
      const suspicious = isSuspiciousVolume(last.volume, beforeToday.slice(-60), beforeToday.slice(-240));

      const ctx: SignalContext = {
        series: {
          EMA9: { current: series.ema9[idx], previous: idx > 0 ? series.ema9[idx - 1] : null },
          EMA26: { current: series.ema26[idx], previous: idx > 0 ? series.ema26[idx - 1] : null },
        },
        metrics: {
          rsi14: series.rsi14[idx],
          buyer_power: power,
          suspicious_volume: suspicious.suspicious,
          pct_from_52w_high: pctFromHigh,
          pct_from_52w_low: pctFromLow,
          composite_rank: rankBySymbol.get(symbol) ?? null,
        },
        history: { money_flow: moneyFlowHistory },
        queueLocked: isQueueLocked(last),
      };

      const evaluation = evaluateSignal(rulesRaw, ctx, true);
      if (evaluation.direction !== "none") {
        allSignals.push({ symbol, date, direction: evaluation.direction, score: evaluation.score, reasons: evaluation.reasons });
      }

      // خروج با سیگنال sell روی پوزیشن باز
      if (evaluation.direction === "sell" && openPositions.has(symbol)) {
        const exitIdx = idx + 1 < series.candles.length ? idx + 1 : null;
        if (exitIdx != null) closePosition(symbol, exitIdx, "sell_signal");
      }

      // ورود با سیگنال buy — فقط اگر پوزیشن باز نداریم و ظرفیت هست
      if (evaluation.direction === "buy" && !openPositions.has(symbol) && openPositions.size < MAX_CONCURRENT_POSITIONS) {
        let entryIdx: number | null = null;
        for (let k = 1; k <= QUEUE_RETRY_DAYS + 1; k++) {
          const candidate = idx + k;
          if (candidate >= series.candles.length) break;
          if (!isQueueLocked(series.candles[candidate]) && series.candles[candidate].open != null) {
            entryIdx = candidate;
            break;
          }
        }
        if (entryIdx != null) {
          const entryPrice = series.candles[entryIdx].open as number;
          openPositions.set(symbol, {
            symbol,
            signalDate: date,
            entryIndex: entryIdx,
            entryDate: series.candles[entryIdx].date,
            entryPrice,
            allocated: equity * ALLOCATION_PCT,
          });
        }
      }
    }

    // ۳. بستن پوزیشن‌هایی که به حداکثر مدت نگه‌داری رسیده‌اند
    for (const [symbol, pos] of [...openPositions.entries()]) {
      const idx = dateIndexBySymbol.get(symbol)!.get(date);
      if (idx == null) continue;
      const heldDays = idx - pos.entryIndex;
      if (heldDays >= MAX_HOLD_DAYS) {
        closePosition(symbol, idx, "max_hold");
      }
    }

    equityPoints.push({ date, equity });
  }

  // بستن پوزیشن‌های باقی‌مانده در پایان بک‌تست
  for (const [symbol] of [...openPositions.entries()]) {
    const series = seriesBySymbol.get(symbol)!;
    closePosition(symbol, series.candles.length - 1, "end_of_backtest");
  }
  if (equityPoints.length > 0) equityPoints[equityPoints.length - 1].equity = equity;

  console.log(`${allSignals.length} سیگنال، ${trades.length} معامله`);

  // ===== متریک‌ها =====
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const expectancy = trades.length > 0 ? trades.reduce((s, t) => s + t.pnl, 0) / trades.length : 0;

  const dailyReturns: number[] = [];
  for (let i = 1; i < equityPoints.length; i++) {
    const prev = equityPoints[i - 1].equity;
    if (prev > 0) dailyReturns.push(equityPoints[i].equity / prev - 1);
  }
  const meanDaily = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
  const stdDaily = Math.sqrt(
    dailyReturns.reduce((s, r) => s + (r - meanDaily) ** 2, 0) / Math.max(1, dailyReturns.length - 1),
  );
  const downside = dailyReturns.filter((r) => r < 0);
  const downsideStd = Math.sqrt(downside.reduce((s, r) => s + r ** 2, 0) / Math.max(1, downside.length));
  const TRADING_DAYS_PER_YEAR = 250;
  const sharpe = stdDaily > 0 ? (meanDaily / stdDaily) * Math.sqrt(TRADING_DAYS_PER_YEAR) : 0;
  const sortino = downsideStd > 0 ? (meanDaily / downsideStd) * Math.sqrt(TRADING_DAYS_PER_YEAR) : 0;

  let peak = equityPoints[0]?.equity ?? equity;
  let maxDrawdownPct = 0;
  let ddStartDate = "";
  let ddPeakDate = "";
  let maxDdDuration = 0;
  let currentDdStart: string | null = null;
  let recoveryDate: string | null = null;
  const underwater: { date: string; pct: number }[] = [];
  for (const point of equityPoints) {
    if (point.equity > peak) {
      peak = point.equity;
      currentDdStart = null;
    } else if (currentDdStart == null) {
      currentDdStart = point.date;
    }
    const ddPct = peak > 0 ? (point.equity / peak - 1) * 100 : 0;
    underwater.push({ date: point.date, pct: ddPct });
    if (ddPct < maxDrawdownPct) {
      maxDrawdownPct = ddPct;
      ddStartDate = currentDdStart ?? point.date;
      ddPeakDate = point.date;
    }
  }
  // مدت ریکاوری تقریبی: از پایین‌ترین نقطهٔ drawdown اصلی تا اولین بازگشت به peak قبلی
  {
    const troughIndex = equityPoints.findIndex((p) => p.date === ddPeakDate);
    if (troughIndex >= 0) {
      let peakBeforeTrough = 0;
      for (let i = 0; i <= troughIndex; i++) peakBeforeTrough = Math.max(peakBeforeTrough, equityPoints[i].equity);
      for (let i = troughIndex + 1; i < equityPoints.length; i++) {
        if (equityPoints[i].equity >= peakBeforeTrough) {
          recoveryDate = equityPoints[i].date;
          maxDdDuration = i - troughIndex;
          break;
        }
      }
    }
  }

  function benchmarkReturn(asset: string): { startDate: string; endDate: string; returnPct: number } | null {
    const rows = (benchmarksByAsset.get(asset) ?? []).filter((r) => r.date >= from && r.close != null);
    if (rows.length < 2) return null;
    const startClose = rows[0].close as number;
    const endClose = rows[rows.length - 1].close as number;
    return { startDate: rows[0].date, endDate: rows[rows.length - 1].date, returnPct: (endClose / startClose - 1) * 100 };
  }

  const strategyReturnPct = equityPoints.length > 0 ? (equity / equityPoints[0].equity - 1) * 100 : 0;
  const benchmarks = {
    tedpix: benchmarkReturn("tedpix"),
    usd_irr: benchmarkReturn("usd_irr"),
    gold_18k: benchmarkReturn("gold_18k"),
  };

  const perRule = new Map<string, { triggered: number; wins: number; totalPnl: number }>();
  for (const trade of trades) {
    const signal = allSignals.find((s) => s.symbol === trade.symbol && s.date === trade.signalDate);
    if (!signal) continue;
    for (const r of signal.reasons) {
      if (!r.triggered) continue;
      const acc = perRule.get(r.rule) ?? { triggered: 0, wins: 0, totalPnl: 0 };
      acc.triggered += 1;
      if (trade.pnl > 0) acc.wins += 1;
      acc.totalPnl += trade.pnl;
      perRule.set(r.rule, acc);
    }
  }

  const summary = {
    from,
    to: calendar[calendar.length - 1] ?? from,
    symbols: symbols.length,
    tradingDays: calendar.length,
    totalSignals: allSignals.length,
    totalTrades: trades.length,
    winRate,
    profitFactor,
    expectancy,
    sharpe,
    sortino,
    maxDrawdownPct,
    ddStartDate,
    ddPeakDate,
    maxDdDurationDays: maxDdDuration,
    recoveryDate,
    strategyReturnPct,
    benchmarks,
    perRule: Object.fromEntries(
      [...perRule.entries()].map(([name, v]) => [
        name,
        { triggered: v.triggered, winRate: v.triggered > 0 ? (v.wins / v.triggered) * 100 : 0, totalPnl: v.totalPnl },
      ]),
    ),
  };

  const outDir = path.join(ROOT, "backtest-reports");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outDir, `backtest-${stamp}.json`);
  const htmlPath = path.join(outDir, `backtest-${stamp}.html`);

  writeFileSync(jsonPath, JSON.stringify({ summary, trades, equityPoints, underwater }, null, 2), "utf-8");
  writeFileSync(htmlPath, renderHtmlReport(summary, trades, equityPoints, underwater), "utf-8");

  console.log("\n=== خلاصه ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nگزارش: ${jsonPath}\n         ${htmlPath}`);
}

function renderHtmlReport(
  summary: Record<string, unknown>,
  trades: Trade[],
  equityPoints: { date: string; equity: number }[],
  underwater: { date: string; pct: number }[],
): string {
  const w = 900;
  const h = 300;
  const equities = equityPoints.map((p) => p.equity);
  const minEq = Math.min(...equities);
  const maxEq = Math.max(...equities);
  const range = maxEq - minEq || 1;
  const points = equityPoints
    .map((p, i) => {
      const x = (i / Math.max(1, equityPoints.length - 1)) * w;
      const y = h - ((p.equity - minEq) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const uwPoints = underwater
    .map((p, i) => {
      const x = (i / Math.max(1, underwater.length - 1)) * w;
      const y = (p.pct / -100) * h * 3; // مقیاس بزرگ‌نمایی برای دیده‌شدن
      return `${x.toFixed(1)},${Math.min(h, y).toFixed(1)}`;
    })
    .join(" ");

  const summaryRows = Object.entries(summary)
    .filter(([k]) => k !== "perRule" && k !== "benchmarks")
    .map(([k, v]) => `<tr><td>${k}</td><td>${typeof v === "number" ? v.toFixed(2) : JSON.stringify(v)}</td></tr>`)
    .join("");

  const benchmarks = summary.benchmarks as Record<string, { returnPct: number } | null>;
  const benchmarkRows = Object.entries(benchmarks)
    .map(([k, v]) => `<tr><td>${k}</td><td>${v ? v.returnPct.toFixed(2) + "%" : "بدون داده"}</td></tr>`)
    .join("");

  const perRule = summary.perRule as Record<string, { triggered: number; winRate: number; totalPnl: number }>;
  const ruleRows = Object.entries(perRule)
    .map(
      ([name, v]) =>
        `<tr><td>${name}</td><td>${v.triggered}</td><td>${v.winRate.toFixed(1)}%</td><td>${v.totalPnl.toFixed(0)}</td></tr>`,
    )
    .join("");

  const tradeRows = trades
    .slice(-100)
    .map(
      (t) =>
        `<tr><td>${t.symbol}</td><td>${t.entryDate}</td><td>${t.exitDate}</td><td>${t.exitReason}</td><td>${t.returnPct.toFixed(2)}%</td></tr>`,
    )
    .join("");

  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>گزارش بک‌تست</title>
<style>
body{font-family:Tahoma,sans-serif;background:#0f1115;color:#e6e6e6;padding:24px;}
h1,h2{color:#fff}
table{border-collapse:collapse;width:100%;margin-bottom:24px;}
td,th{border:1px solid #333;padding:6px 10px;text-align:right;font-size:13px;}
svg{background:#1a1d24;border-radius:8px;}
.pos{color:#4ade80}.neg{color:#f87171}
</style></head><body>
<h1>گزارش بک‌تست ${summary.from} تا ${summary.to}</h1>

<h2>Equity Curve</h2>
<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}"><polyline points="${points}" fill="none" stroke="#4ade80" stroke-width="2"/></svg>

<h2>Underwater (Drawdown)</h2>
<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}"><polyline points="${uwPoints}" fill="none" stroke="#f87171" stroke-width="2"/></svg>

<h2>خلاصه</h2>
<table>${summaryRows}</table>

<h2>بازده در برابر بنچمارک‌ها</h2>
<table><tr><th>دارایی</th><th>بازده٪</th></tr>${benchmarkRows}</table>

<h2>عملکرد به تفکیک قانون</h2>
<table><tr><th>قانون</th><th>تعداد</th><th>win rate</th><th>مجموع سود/زیان</th></tr>${ruleRows}</table>

<h2>۱۰۰ معاملهٔ آخر</h2>
<table><tr><th>نماد</th><th>ورود</th><th>خروج</th><th>دلیل خروج</th><th>بازده</th></tr>${tradeRows}</table>
</body></html>`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
