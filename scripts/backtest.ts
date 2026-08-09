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

// حداقل تعداد trigger یک قانون در بازهٔ train برای این‌که «قابل بازتنظیم» در نظر گرفته شود.
// طبق تأیید صریح کاربر (پرامپت ۳): قوانین با trigger کمتر از این، دستی تنظیم نمی‌شوند و وزن
// پیش‌فرض heuristic (پایین) را نگه می‌دارند — روی نمونهٔ کوچک، «بهترین» وزن صرفاً نویز است.
const MIN_TRIGGERS_TO_TUNE = 20;

// وزن‌های اولیهٔ heuristic (مایگریشن stage03، قبل از تنظیم stage03d بر اساس بک‌تست کامل).
// برای قوانینی که در بازهٔ train به‌اندازهٔ کافی trigger نمی‌شوند (کمتر از MIN_TRIGGERS_TO_TUNE)،
// به همین وزن پیش‌فرض برمی‌گردیم به‌جای تنظیم دستی روی نمونهٔ کوچک.
const STAGE03_BASELINE_RULES: SignalRule[] = [
  { name: "rsi_oversold", definition: { type: "threshold", metric: "rsi14", op: "<", value: 30 }, weight: 15, enabled: true },
  { name: "rsi_overbought", definition: { type: "threshold", metric: "rsi14", op: ">", value: 70 }, weight: -15, enabled: true },
  { name: "ema_cross_up", definition: { type: "cross", fast: "EMA9", slow: "EMA26", direction: "up" }, weight: 20, enabled: true },
  { name: "ema_cross_down", definition: { type: "cross", fast: "EMA9", slow: "EMA26", direction: "down" }, weight: -20, enabled: true },
  { name: "suspicious_volume", definition: { type: "threshold", metric: "suspicious_volume", op: "==", value: 1 }, weight: 10, enabled: true },
  { name: "buyer_power_strong", definition: { type: "threshold", metric: "buyer_power", op: ">", value: 2 }, weight: 15, enabled: true },
  { name: "money_inflow_3d", definition: { type: "streak", metric: "money_flow", op: ">", value: 0, days: 3 }, weight: 20, enabled: true },
  { name: "near_52w_high", definition: { type: "threshold", metric: "pct_from_52w_high", op: ">=", value: -3 }, weight: 15, enabled: true },
  { name: "near_52w_low", definition: { type: "threshold", metric: "pct_from_52w_low", op: "<=", value: 3 }, weight: -15, enabled: true },
  { name: "composite_rank_strong", definition: { type: "threshold", metric: "composite_rank", op: ">=", value: 80 }, weight: 15, enabled: true },
];

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

function parseArgs(argv: string[]): { from: string; rules: string; trainRatio: number; rulesFile: string | null } {
  let from = "2021-01-01";
  let rules = "default";
  let trainRatio = 0.7;
  let rulesFile: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from" && argv[i + 1]) from = argv[++i];
    if (argv[i] === "--rules" && argv[i + 1]) rules = argv[++i];
    if (argv[i] === "--trainRatio" && argv[i + 1]) trainRatio = Number(argv[++i]);
    if (argv[i] === "--rulesFile" && argv[i + 1]) rulesFile = argv[++i];
  }
  if (!(trainRatio > 0 && trainRatio < 1)) {
    throw new Error(`--trainRatio باید بین ۰ و ۱ باشد، دریافت شد: ${trainRatio}`);
  }
  return { from, rules, trainRatio, rulesFile };
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
  const { from, rules: rulesArg, trainRatio, rulesFile } = parseArgs(process.argv.slice(2));
  const env = { ...loadEnvLocal(), ...process.env };
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY باید در .env.local باشند.");
    process.exit(1);
  }
  const validRulesArgs = ["default", "stage03-baseline", "file"];
  if (!validRulesArgs.includes(rulesArg)) {
    console.error(`--rules باید یکی از ${validRulesArgs.join("/")} باشد. دریافت شد: ${rulesArg}`);
    process.exit(1);
  }
  if (rulesArg === "file" && !rulesFile) {
    console.error("--rules file نیاز به --rulesFile <path> دارد.");
    process.exit(1);
  }

  console.log(`بک‌تست از ${from}، قوانین: ${rulesArg}${rulesFile ? ` (${rulesFile})` : ""}`);

  const watchlistRows = await fetchAll<{ symbol: string }>(supabaseUrl, serviceKey, "watchlist", "symbol");
  const symbols = watchlistRows.map((w) => w.symbol);
  console.log(`${symbols.length} نماد`);

  // منبع قوانین: دیتای زندهٔ signal_rules (پیش‌فرض)، وزن‌های heuristic اولیهٔ stage03 (برای
  // تحلیل بدون leakage)، یا یک فایل JSON دلخواه (برای وزن‌های بازتنظیم‌شدهٔ کاندید — هیچ‌کدام
  // از این دو حالت جدول production را نمی‌خوانند/نمی‌نویسند).
  let rulesRaw: SignalRule[];
  if (rulesArg === "stage03-baseline") {
    rulesRaw = STAGE03_BASELINE_RULES;
    console.log(`${rulesRaw.length} قانون (وزن‌های heuristic اولیهٔ stage03، بدون خواندن از DB)`);
  } else if (rulesArg === "file") {
    rulesRaw = JSON.parse(readFileSync(rulesFile as string, "utf-8")) as SignalRule[];
    console.log(`${rulesRaw.length} قانون (از ${rulesFile})`);
  } else {
    rulesRaw = await fetchAll<SignalRule>(
      supabaseUrl,
      serviceKey,
      "signal_rules",
      "name,definition,weight,enabled",
      { enabled: "eq.true" },
    );
    console.log(`${rulesRaw.length} قانون فعال (زندهٔ DB)`);
  }

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

  // نرخ دلار آزاد به تفکیک تاریخ (برای «بازده به دلار» — بخش ۲ پرامپت). چون تاریخ‌های
  // usd_irr لزوماً دقیقاً با روزهای معاملاتی بورس یکی نیست، آخرین نرخ ثبت‌شده تا همان تاریخ
  // (نه دقیقاً همان روز) استفاده می‌شود — همان رفتار طبیعی «آخرین نرخ شناخته‌شده».
  const usdRows = (benchmarksByAsset.get("usd_irr") ?? []).filter((r) => r.close != null);
  function usdRateAt(date: string): number | null {
    if (usdRows.length === 0) return null;
    let lo = 0;
    let hi = usdRows.length - 1;
    if (date < usdRows[0].date) return null;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (usdRows[mid].date <= date) lo = mid;
      else hi = mid - 1;
    }
    return usdRows[lo].close as number;
  }
  // بازدهٔ یک سری قیمتی (تاریخ→مقدار به ریال) بعد از تعدیل با نرخ دلار همان روز — یعنی بازده
  // واقعی «به دلار»، نه بازده اسمی ریالی. اگر پوشش نرخ دلار برای ابتدا/انتهای بازه موجود نباشد
  // null برمی‌گردد (به‌جای عدد گمراه‌کننده).
  function usdAdjustedReturnPct(points: { date: string; value: number }[]): number | null {
    if (points.length < 2) return null;
    const startRate = usdRateAt(points[0].date);
    const endRate = usdRateAt(points[points.length - 1].date);
    if (startRate == null || endRate == null || startRate <= 0) return null;
    const startUsd = points[0].value / startRate;
    const endUsd = points[points.length - 1].value / endRate;
    if (startUsd === 0) return null;
    return (endUsd / startUsd - 1) * 100;
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
  const positionCountByDate = new Map<string, number>(); // برای تحلیل «زمان حضور در بازار» (تشخیص میانی)
  let equity = 1_000_000; // واحد دلخواه، فقط نسبی مهم است
  // فرض محدودیت‌دار مهم: equity فقط با closePosition (خط پایین) تغییر می‌کند — یعنی سهم نقدِ
  // استفاده‌نشده (طبق تشخیص «سرمایهٔ درگیر»، به‌طور میانگین ~۷۳٪ از کل) بازدهی صفر فرض شده،
  // نه نرخ سود بانکی/سپرده. هیچ داده‌ای از نرخ سپردهٔ بانکی در این پروژه ردیابی نمی‌شود، پس این
  // فرض عمداً ساده‌سازی‌شده مانده، نه اینکه بازدهی واقعی نقد صفر باشد.

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
    positionCountByDate.set(date, openPositions.size);
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

  function benchmarkReturn(
    asset: string,
    periodFrom: string,
    periodTo: string,
  ): { startDate: string; endDate: string; returnPct: number } | null {
    const rows = (benchmarksByAsset.get(asset) ?? []).filter(
      (r) => r.date >= periodFrom && r.date <= periodTo && r.close != null,
    );
    if (rows.length < 2) return null;
    const startClose = rows[0].close as number;
    const endClose = rows[rows.length - 1].close as number;
    return { startDate: rows[0].date, endDate: rows[rows.length - 1].date, returnPct: (endClose / startClose - 1) * 100 };
  }

  // بخش ۲ پرامپت — همان بازدهٔ بنچمارک بالا، این‌بار بعد از تعدیل با نرخ دلار همان روز. برای
  // usd_irr خودش این همیشه ۰٪ است (دلار نسبت به خودش تغییر نمی‌کند) — این عمداً یک sanity check
  // بصریه، نه باگ.
  function benchmarkReturnUsd(asset: string, periodFrom: string, periodTo: string): number | null {
    const rows = (benchmarksByAsset.get(asset) ?? []).filter(
      (r) => r.date >= periodFrom && r.date <= periodTo && r.close != null,
    );
    if (rows.length < 2) return null;
    return usdAdjustedReturnPct(rows.map((r) => ({ date: r.date, value: r.close as number })));
  }

  const overallTo = calendar[calendar.length - 1] ?? from;
  const strategyReturnPct = equityPoints.length > 0 ? (equity / equityPoints[0].equity - 1) * 100 : 0;
  const strategyReturnPctUsd = usdAdjustedReturnPct(equityPoints.map((p) => ({ date: p.date, value: p.equity })));
  const benchmarks = {
    tedpix: benchmarkReturn("tedpix", from, overallTo),
    usd_irr: benchmarkReturn("usd_irr", from, overallTo),
    gold_18k: benchmarkReturn("gold_18k", from, overallTo),
  };
  const benchmarksUsd = {
    tedpix: benchmarkReturnUsd("tedpix", from, overallTo),
    usd_irr: benchmarkReturnUsd("usd_irr", from, overallTo),
    gold_18k: benchmarkReturnUsd("gold_18k", from, overallTo),
  };

  // ===== بخش ۱ — زیرساخت train/test split =====
  // تقسیم بر اساس تاریخ (نه تعداد معامله): trainRatio ابتدای تقویم معاملاتی = train، باقی = test.
  // هیچ وزن/threshold ای در این بخش تنظیم نمی‌شود — فقط گزارش‌گیری جدا برای دو بازه، تا مبنای
  // صادقی برای هر تنظیم آیندهٔ وزن (که فقط باید روی train انجام شود) وجود داشته باشد.
  interface PeriodMetrics {
    from: string;
    to: string;
    tradingDays: number;
    totalTrades: number;
    winRate: number;
    profitFactor: number;
    expectancy: number;
    sharpe: number;
    sortino: number;
    maxDrawdownPct: number;
    periodReturnPct: number;
    periodReturnPctUsd: number | null;
    benchmarks: {
      tedpix: ReturnType<typeof benchmarkReturn>;
      usd_irr: ReturnType<typeof benchmarkReturn>;
      gold_18k: ReturnType<typeof benchmarkReturn>;
    };
    benchmarksUsd: {
      tedpix: number | null;
      usd_irr: number | null;
      gold_18k: number | null;
    };
  }

  function computePeriodMetrics(periodFrom: string, periodTo: string): PeriodMetrics {
    const periodTrades = trades.filter((t) => t.entryDate >= periodFrom && t.entryDate <= periodTo);
    const periodEquityPoints = equityPoints.filter((p) => p.date >= periodFrom && p.date <= periodTo);

    const pWins = periodTrades.filter((t) => t.pnl > 0);
    const pLosses = periodTrades.filter((t) => t.pnl <= 0);
    const pWinRate = periodTrades.length > 0 ? (pWins.length / periodTrades.length) * 100 : 0;
    const pGrossProfit = pWins.reduce((s, t) => s + t.pnl, 0);
    const pGrossLoss = Math.abs(pLosses.reduce((s, t) => s + t.pnl, 0));
    const pProfitFactor = pGrossLoss > 0 ? pGrossProfit / pGrossLoss : pGrossProfit > 0 ? Infinity : 0;
    const pExpectancy = periodTrades.length > 0 ? periodTrades.reduce((s, t) => s + t.pnl, 0) / periodTrades.length : 0;

    const pDailyReturns: number[] = [];
    for (let i = 1; i < periodEquityPoints.length; i++) {
      const prev = periodEquityPoints[i - 1].equity;
      if (prev > 0) pDailyReturns.push(periodEquityPoints[i].equity / prev - 1);
    }
    const pMeanDaily = pDailyReturns.length > 0 ? pDailyReturns.reduce((a, b) => a + b, 0) / pDailyReturns.length : 0;
    const pStdDaily = Math.sqrt(
      pDailyReturns.reduce((s, r) => s + (r - pMeanDaily) ** 2, 0) / Math.max(1, pDailyReturns.length - 1),
    );
    const pDownside = pDailyReturns.filter((r) => r < 0);
    const pDownsideStd = Math.sqrt(pDownside.reduce((s, r) => s + r ** 2, 0) / Math.max(1, pDownside.length));
    const pSharpe = pStdDaily > 0 ? (pMeanDaily / pStdDaily) * Math.sqrt(TRADING_DAYS_PER_YEAR) : 0;
    const pSortino = pDownsideStd > 0 ? (pMeanDaily / pDownsideStd) * Math.sqrt(TRADING_DAYS_PER_YEAR) : 0;

    let pPeak = periodEquityPoints[0]?.equity ?? 0;
    let pMaxDrawdownPct = 0;
    for (const point of periodEquityPoints) {
      if (point.equity > pPeak) pPeak = point.equity;
      const ddPct = pPeak > 0 ? (point.equity / pPeak - 1) * 100 : 0;
      if (ddPct < pMaxDrawdownPct) pMaxDrawdownPct = ddPct;
    }

    // بازدهٔ ایزوله‌شدهٔ همین بازه: نسبت به سرمایهٔ ابتدای همین بازه (نه سرمایهٔ اولیهٔ کل بک‌تست)،
    // چون هدف سنجش عملکرد استراتژی در این پنجرهٔ زمانی مستقل از پنجرهٔ قبلی است.
    const periodReturnPct =
      periodEquityPoints.length > 1 && periodEquityPoints[0].equity > 0
        ? (periodEquityPoints[periodEquityPoints.length - 1].equity / periodEquityPoints[0].equity - 1) * 100
        : 0;
    const periodReturnPctUsd = usdAdjustedReturnPct(periodEquityPoints.map((p) => ({ date: p.date, value: p.equity })));

    return {
      from: periodFrom,
      to: periodTo,
      tradingDays: periodEquityPoints.length,
      totalTrades: periodTrades.length,
      winRate: pWinRate,
      profitFactor: pProfitFactor,
      expectancy: pExpectancy,
      sharpe: pSharpe,
      sortino: pSortino,
      maxDrawdownPct: pMaxDrawdownPct,
      periodReturnPct,
      periodReturnPctUsd,
      benchmarks: {
        tedpix: benchmarkReturn("tedpix", periodFrom, periodTo),
        usd_irr: benchmarkReturn("usd_irr", periodFrom, periodTo),
        gold_18k: benchmarkReturn("gold_18k", periodFrom, periodTo),
      },
      benchmarksUsd: {
        tedpix: benchmarkReturnUsd("tedpix", periodFrom, periodTo),
        usd_irr: benchmarkReturnUsd("usd_irr", periodFrom, periodTo),
        gold_18k: benchmarkReturnUsd("gold_18k", periodFrom, periodTo),
      },
    };
  }

  const splitIndex = Math.floor(calendar.length * trainRatio);
  const trainTo = calendar[Math.max(0, splitIndex - 1)] ?? from;
  const testFrom = calendar[Math.min(calendar.length - 1, splitIndex)] ?? overallTo;
  // شمارش trigger/win-rate/PnL هر قانون، فقط روی معاملاتی که entryDate‌شان در بازهٔ داده‌شده است
  // (برای بازتنظیم وزن، این باید فقط با بازهٔ train صدا زده شود تا نشتی از test نداشته باشیم).
  function computePeriodPerRule(periodFrom: string, periodTo: string) {
    const perRule = new Map<string, { triggered: number; wins: number; totalPnl: number }>();
    for (const trade of trades) {
      if (trade.entryDate < periodFrom || trade.entryDate > periodTo) continue;
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
    return Object.fromEntries(
      [...perRule.entries()].map(([name, v]) => [
        name,
        {
          triggered: v.triggered,
          winRate: v.triggered > 0 ? (v.wins / v.triggered) * 100 : 0,
          totalPnl: v.totalPnl,
          tunable: v.triggered >= MIN_TRIGGERS_TO_TUNE,
        },
      ]),
    );
  }

  const trainMetrics = computePeriodMetrics(from, trainTo);
  const testMetrics = computePeriodMetrics(testFrom, overallTo);
  const trainTestSplit = {
    trainRatio,
    splitDate: testFrom,
    minTriggersToTune: MIN_TRIGGERS_TO_TUNE,
    train: trainMetrics,
    test: testMetrics,
    trainPerRule: computePeriodPerRule(from, trainTo),
    testPerRule: computePeriodPerRule(testFrom, overallTo),
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

  // ===== بخش ۳ — بازهٔ اطمینان bootstrap =====
  // PRNG بذر ثابت (نه Math.random) عمداً: می‌خواهیم این بازهٔ اطمینان بین اجراهای مختلف کاملاً
  // تکرارپذیر باشد — دقیقاً همان دلیلی که در بررسی «چرا دو عدد فرق داشت» (این session) اهمیتش
  // روشن شد. mulberry32 یک PRNG سبک و رایج برای همین منظور است.
  function mulberry32(seed: number) {
    let a = seed;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const BOOTSTRAP_SEED = 42;
  const BOOTSTRAP_ITERATIONS = 5000;
  const CI_TAIL = 0.05; // ۹۰٪ CI => صدک ۵ و ۹۵

  function percentile(sortedAsc: number[], p: number): number {
    if (sortedAsc.length === 0) return NaN;
    const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round(p * (sortedAsc.length - 1))));
    return sortedAsc[idx];
  }

  interface BootstrapCI {
    n: number;
    iterations: number;
    profitFactor: { p05: number; median: number; p95: number };
    // بازدهٔ ترکیبی (compounded) تقریبی هر resample: چون bootstrap ترتیب زمانی معاملات را به‌هم
    // می‌ریزد، شبیه‌سازی دقیق منحنی equity (با تا ۱۰ پوزیشن هم‌زمان) ممکن نیست — این یک تقریب
    // مرسوم است: هر معامله را جدا با سهم ثابت ALLOCATION_PCT از سرمایه فرض می‌کنیم و ترکیب می‌کنیم.
    // یعنی عدد میانه‌اش لزوماً دقیقاً با periodReturnPct واقعی یکی نیست — برای پهنای بازه مهم است.
    totalReturnPctApprox: { p05: number; median: number; p95: number };
    excessReturnVsTedpixPctApprox: { p05: number; median: number; p95: number } | null;
  }

  function bootstrapCI(tradeList: Trade[], tedpixReturnPct: number | null): BootstrapCI | null {
    if (tradeList.length === 0) return null;
    const rng = mulberry32(BOOTSTRAP_SEED);
    const pfSamples: number[] = [];
    const returnSamples: number[] = [];
    const excessSamples: number[] = [];
    for (let iter = 0; iter < BOOTSTRAP_ITERATIONS; iter++) {
      let grossProfit = 0;
      let grossLoss = 0;
      let compounded = 1;
      for (let i = 0; i < tradeList.length; i++) {
        const t = tradeList[Math.floor(rng() * tradeList.length)];
        if (t.pnl > 0) grossProfit += t.pnl;
        else grossLoss += Math.abs(t.pnl);
        compounded *= 1 + (t.returnPct / 100) * ALLOCATION_PCT;
      }
      const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
      const totalReturnPct = (compounded - 1) * 100;
      pfSamples.push(pf);
      returnSamples.push(totalReturnPct);
      if (tedpixReturnPct != null) excessSamples.push(totalReturnPct - tedpixReturnPct);
    }
    pfSamples.sort((a, b) => a - b);
    returnSamples.sort((a, b) => a - b);
    excessSamples.sort((a, b) => a - b);
    return {
      n: tradeList.length,
      iterations: BOOTSTRAP_ITERATIONS,
      profitFactor: {
        p05: percentile(pfSamples, CI_TAIL),
        median: percentile(pfSamples, 0.5),
        p95: percentile(pfSamples, 1 - CI_TAIL),
      },
      totalReturnPctApprox: {
        p05: percentile(returnSamples, CI_TAIL),
        median: percentile(returnSamples, 0.5),
        p95: percentile(returnSamples, 1 - CI_TAIL),
      },
      excessReturnVsTedpixPctApprox:
        tedpixReturnPct != null
          ? {
              p05: percentile(excessSamples, CI_TAIL),
              median: percentile(excessSamples, 0.5),
              p95: percentile(excessSamples, 1 - CI_TAIL),
            }
          : null,
    };
  }

  const trainTrades = trades.filter((t) => t.entryDate >= from && t.entryDate <= trainTo);
  const testTrades = trades.filter((t) => t.entryDate >= testFrom && t.entryDate <= overallTo);
  const bootstrap = {
    seed: BOOTSTRAP_SEED,
    iterations: BOOTSTRAP_ITERATIONS,
    ciLevel: 1 - 2 * CI_TAIL,
    overall: bootstrapCI(trades, benchmarks.tedpix?.returnPct ?? null),
    train: bootstrapCI(trainTrades, trainMetrics.benchmarks.tedpix?.returnPct ?? null),
    test: bootstrapCI(testTrades, testMetrics.benchmarks.tedpix?.returnPct ?? null),
  };

  // ===== تشخیص میانی — زمان حضور در بازار در برابر نقد، و آیا این با بزرگ‌ترین روزهای رشد =====
  // ===== تدپیکس هم‌پوشانی دارد (درخواست کاربر، قبل از تصمیم دربارهٔ گستردن دامنهٔ نماد) =====
  interface TimeInMarketReport {
    from: string;
    to: string;
    totalDays: number;
    inMarketDays: number;
    pctInMarket: number;
    // «در بازار» بالا باینریه (حداقل ۱ پوزیشن از ۱۰ ظرفیت) — ممکن است فریب‌دهنده باشد چون یک
    // پوزیشن از ۱۰ هم «در بازار» حساب می‌شود ولی فقط ۱۰٪ سرمایه را درگیر کرده. این عدد دقیق‌تره:
    // میانگین سهم واقعی سرمایهٔ درگیرشده (تعداد پوزیشن باز × ۱۰٪، سقف ۱۰۰٪) در طول بازه.
    avgCapitalUtilizationPct: number;
    tedpixTop10UpDays: { date: string; tedpixChangePct: number; strategyInMarket: boolean }[];
    tedpixTop10UpDaysInMarketPct: number | null;
    tedpixTopDecileUpDaysInMarketPct: number | null; // بالای بازهٔ ۱۰٪ روزهای پررشدترین (برای مقیاس‌پذیری با طول بازه)
  }

  function computeTimeInMarket(periodFrom: string, periodTo: string): TimeInMarketReport {
    const periodDays = calendar.filter((d) => d >= periodFrom && d <= periodTo);
    const inMarketDays = periodDays.filter((d) => (positionCountByDate.get(d) ?? 0) > 0);
    const pctInMarket = periodDays.length > 0 ? (inMarketDays.length / periodDays.length) * 100 : 0;
    const avgCapitalUtilizationPct =
      periodDays.length > 0
        ? periodDays.reduce((s, d) => s + Math.min(100, (positionCountByDate.get(d) ?? 0) * ALLOCATION_PCT * 100), 0) /
          periodDays.length
        : 0;

    const tedpixRows = (benchmarksByAsset.get("tedpix") ?? []).filter(
      (r) => r.date >= periodFrom && r.date <= periodTo && r.close != null,
    );
    const tedpixDailyChanges: { date: string; changePct: number }[] = [];
    for (let i = 1; i < tedpixRows.length; i++) {
      const prevClose = tedpixRows[i - 1].close as number;
      const close = tedpixRows[i].close as number;
      if (prevClose > 0) tedpixDailyChanges.push({ date: tedpixRows[i].date, changePct: (close / prevClose - 1) * 100 });
    }
    const sortedDesc = [...tedpixDailyChanges].sort((a, b) => b.changePct - a.changePct);

    const top10 = sortedDesc.slice(0, 10).map((d) => ({
      date: d.date,
      tedpixChangePct: d.changePct,
      // اگر روزی داده‌ای در calendar بورس نداشت (نماد trading day نبود)، نامشخص=false گزارش می‌شود
      strategyInMarket: (positionCountByDate.get(d.date) ?? 0) > 0,
    }));
    const top10InMarketPct = top10.length > 0 ? (top10.filter((d) => d.strategyInMarket).length / top10.length) * 100 : null;

    const decileCount = Math.max(1, Math.round(sortedDesc.length * 0.1));
    const topDecile = sortedDesc.slice(0, decileCount);
    const topDecileInMarketPct =
      topDecile.length > 0
        ? (topDecile.filter((d) => (positionCountByDate.get(d.date) ?? 0) > 0).length / topDecile.length) * 100
        : null;

    return {
      from: periodFrom,
      to: periodTo,
      totalDays: periodDays.length,
      inMarketDays: inMarketDays.length,
      pctInMarket,
      avgCapitalUtilizationPct,
      tedpixTop10UpDays: top10,
      tedpixTop10UpDaysInMarketPct: top10InMarketPct,
      tedpixTopDecileUpDaysInMarketPct: topDecileInMarketPct,
    };
  }

  const timeInMarket = {
    overall: computeTimeInMarket(from, overallTo),
    train: computeTimeInMarket(from, trainTo),
    test: computeTimeInMarket(testFrom, overallTo),
  };

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
    strategyReturnPctUsd,
    benchmarks,
    benchmarksUsd,
    trainTestSplit,
    bootstrap,
    timeInMarket,
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

  console.log(`\n=== Train (${trainMetrics.from} تا ${trainMetrics.to}) vs Test (${testMetrics.from} تا ${testMetrics.to}) ===`);
  console.table({
    "تعداد معامله": { train: trainMetrics.totalTrades, test: testMetrics.totalTrades },
    "win rate٪": { train: trainMetrics.winRate.toFixed(1), test: testMetrics.winRate.toFixed(1) },
    "profit factor": { train: trainMetrics.profitFactor.toFixed(3), test: testMetrics.profitFactor.toFixed(3) },
    "بازدهٔ بازه٪ (ریالی)": { train: trainMetrics.periodReturnPct.toFixed(2), test: testMetrics.periodReturnPct.toFixed(2) },
    "بازدهٔ بازه٪ (به دلار)": {
      train: trainMetrics.periodReturnPctUsd != null ? trainMetrics.periodReturnPctUsd.toFixed(2) : "بدون داده",
      test: testMetrics.periodReturnPctUsd != null ? testMetrics.periodReturnPctUsd.toFixed(2) : "بدون داده",
    },
    "حداکثر افت سرمایه٪": { train: trainMetrics.maxDrawdownPct.toFixed(2), test: testMetrics.maxDrawdownPct.toFixed(2) },
  });

  console.log(`\n=== بازده به دلار در برابر بنچمارک‌ها (کل بازه) ===`);
  console.table({
    استراتژی: strategyReturnPctUsd != null ? strategyReturnPctUsd.toFixed(2) + "%" : "بدون داده",
    تدپیکس: benchmarksUsd.tedpix != null ? benchmarksUsd.tedpix.toFixed(2) + "%" : "بدون داده",
    "دلار (مبنا)": benchmarksUsd.usd_irr != null ? benchmarksUsd.usd_irr.toFixed(2) + "%" : "بدون داده",
    "طلای ۱۸عیار": benchmarksUsd.gold_18k != null ? benchmarksUsd.gold_18k.toFixed(2) + "%" : "بدون داده",
  });

  console.log(`\n=== trigger هر قانون در بازهٔ train (${trainMetrics.from} تا ${trainMetrics.to}) ===`);
  console.table(trainTestSplit.trainPerRule);

  console.log(
    `\n=== بازهٔ اطمینان ۹۰٪ (bootstrap، seed=${BOOTSTRAP_SEED}، ${BOOTSTRAP_ITERATIONS} تکرار) ===`,
  );
  const fmtCi = (ci: { p05: number; median: number; p95: number } | undefined | null) =>
    ci ? `${ci.p05.toFixed(3)} … ${ci.median.toFixed(3)} … ${ci.p95.toFixed(3)}` : "بدون داده";
  console.table({
    "profit factor (کل)": { بازه: fmtCi(bootstrap.overall?.profitFactor) },
    "profit factor (train)": { بازه: fmtCi(bootstrap.train?.profitFactor) },
    "profit factor (test)": { بازه: fmtCi(bootstrap.test?.profitFactor) },
    "بازده تقریبی٪ (کل)": { بازه: fmtCi(bootstrap.overall?.totalReturnPctApprox) },
    "بازده تقریبی٪ (train)": { بازه: fmtCi(bootstrap.train?.totalReturnPctApprox) },
    "بازده تقریبی٪ (test)": { بازه: fmtCi(bootstrap.test?.totalReturnPctApprox) },
    "بازده مازاد بر تدپیکس٪ (کل)": { بازه: fmtCi(bootstrap.overall?.excessReturnVsTedpixPctApprox) },
    "بازده مازاد بر تدپیکس٪ (train)": { بازه: fmtCi(bootstrap.train?.excessReturnVsTedpixPctApprox) },
    "بازده مازاد بر تدپیکس٪ (test)": { بازه: fmtCi(bootstrap.test?.excessReturnVsTedpixPctApprox) },
  });

  console.log(`\n=== زمان حضور در بازار در برابر نقد ===`);
  console.table({
    "کل بازه": {
      "٪ روز در بازار (≥۱ پوزیشن)": timeInMarket.overall.pctInMarket.toFixed(1),
      "٪ میانگین سرمایهٔ درگیر": timeInMarket.overall.avgCapitalUtilizationPct.toFixed(1),
      "٪ در بازار، ۱۰ روز پررشدترین تدپیکس": timeInMarket.overall.tedpixTop10UpDaysInMarketPct?.toFixed(1) ?? "—",
      "٪ در بازار، دهک اول روزهای پررشد": timeInMarket.overall.tedpixTopDecileUpDaysInMarketPct?.toFixed(1) ?? "—",
    },
    Train: {
      "٪ روز در بازار (≥۱ پوزیشن)": timeInMarket.train.pctInMarket.toFixed(1),
      "٪ میانگین سرمایهٔ درگیر": timeInMarket.train.avgCapitalUtilizationPct.toFixed(1),
      "٪ در بازار، ۱۰ روز پررشدترین تدپیکس": timeInMarket.train.tedpixTop10UpDaysInMarketPct?.toFixed(1) ?? "—",
      "٪ در بازار، دهک اول روزهای پررشد": timeInMarket.train.tedpixTopDecileUpDaysInMarketPct?.toFixed(1) ?? "—",
    },
    Test: {
      "٪ روز در بازار (≥۱ پوزیشن)": timeInMarket.test.pctInMarket.toFixed(1),
      "٪ میانگین سرمایهٔ درگیر": timeInMarket.test.avgCapitalUtilizationPct.toFixed(1),
      "٪ در بازار، ۱۰ روز پررشدترین تدپیکس": timeInMarket.test.tedpixTop10UpDaysInMarketPct?.toFixed(1) ?? "—",
      "٪ در بازار، دهک اول روزهای پررشد": timeInMarket.test.tedpixTopDecileUpDaysInMarketPct?.toFixed(1) ?? "—",
    },
  });

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
    .filter(
      ([k]) =>
        k !== "perRule" &&
        k !== "benchmarks" &&
        k !== "benchmarksUsd" &&
        k !== "trainTestSplit" &&
        k !== "bootstrap" &&
        k !== "timeInMarket",
    )
    .map(([k, v]) => `<tr><td>${k}</td><td>${typeof v === "number" ? v.toFixed(2) : JSON.stringify(v)}</td></tr>`)
    .join("");

  const split = summary.trainTestSplit as {
    trainRatio: number;
    splitDate: string;
    train: Record<string, unknown>;
    test: Record<string, unknown>;
  };
  const splitFields: [string, string][] = [
    ["from", "شروع"],
    ["to", "پایان"],
    ["tradingDays", "روز معاملاتی"],
    ["totalTrades", "تعداد معامله"],
    ["winRate", "win rate٪"],
    ["profitFactor", "profit factor"],
    ["periodReturnPct", "بازدهٔ بازه٪ (ریالی)"],
    ["periodReturnPctUsd", "بازدهٔ بازه٪ (به دلار)"],
    ["maxDrawdownPct", "حداکثر افت سرمایه٪"],
    ["sharpe", "شارپ"],
    ["sortino", "سورتینو"],
  ];
  const fmt = (v: unknown) => (typeof v === "number" ? v.toFixed(3) : v == null ? "بدون داده" : String(v));
  const splitRows = splitFields
    .map(
      ([key, label]) =>
        `<tr><td>${label}</td><td>${fmt((split.train as Record<string, unknown>)[key])}</td><td>${fmt((split.test as Record<string, unknown>)[key])}</td></tr>`,
    )
    .join("");
  const trainBench = split.train.benchmarks as Record<string, { returnPct: number } | null>;
  const testBench = split.test.benchmarks as Record<string, { returnPct: number } | null>;
  const splitBenchRows = Object.keys(trainBench)
    .map(
      (asset) =>
        `<tr><td>${asset}</td><td>${trainBench[asset] ? trainBench[asset]!.returnPct.toFixed(2) + "%" : "بدون داده"}</td><td>${testBench[asset] ? testBench[asset]!.returnPct.toFixed(2) + "%" : "بدون داده"}</td></tr>`,
    )
    .join("");
  const trainBenchUsd = split.train.benchmarksUsd as Record<string, number | null>;
  const testBenchUsd = split.test.benchmarksUsd as Record<string, number | null>;
  const splitBenchUsdRows = Object.keys(trainBenchUsd)
    .map(
      (asset) =>
        `<tr><td>${asset}</td><td>${trainBenchUsd[asset] != null ? trainBenchUsd[asset]!.toFixed(2) + "%" : "بدون داده"}</td><td>${testBenchUsd[asset] != null ? testBenchUsd[asset]!.toFixed(2) + "%" : "بدون داده"}</td></tr>`,
    )
    .join("");

  const benchmarks = summary.benchmarks as Record<string, { returnPct: number } | null>;
  const benchmarkRows = Object.entries(benchmarks)
    .map(([k, v]) => `<tr><td>${k}</td><td>${v ? v.returnPct.toFixed(2) + "%" : "بدون داده"}</td></tr>`)
    .join("");

  const benchmarksUsdReport = summary.benchmarksUsd as Record<string, number | null>;
  const benchmarkUsdRows = Object.entries(benchmarksUsdReport)
    .map(([k, v]) => `<tr><td>${k}</td><td>${v != null ? v.toFixed(2) + "%" : "بدون داده"}</td></tr>`)
    .join("");
  const strategyReturnPctUsdReport = summary.strategyReturnPctUsd as number | null;

  type CiTriplet = { p05: number; median: number; p95: number };
  type BootstrapEntry = {
    n: number;
    iterations: number;
    profitFactor: CiTriplet;
    totalReturnPctApprox: CiTriplet;
    excessReturnVsTedpixPctApprox: CiTriplet | null;
  } | null;
  const bootstrap = summary.bootstrap as { seed: number; iterations: number; ciLevel: number; overall: BootstrapEntry; train: BootstrapEntry; test: BootstrapEntry };
  const fmtCiHtml = (ci: CiTriplet | null | undefined) => (ci ? `${ci.p05.toFixed(3)} … <b>${ci.median.toFixed(3)}</b> … ${ci.p95.toFixed(3)}` : "بدون داده");
  const bootstrapRows = (["overall", "train", "test"] as const)
    .map((key) => {
      const label = key === "overall" ? "کل بازه" : key === "train" ? "Train" : "Test";
      const b = bootstrap[key];
      return `<tr><td>${label}</td><td>${b?.n ?? 0}</td><td>${fmtCiHtml(b?.profitFactor)}</td><td>${fmtCiHtml(b?.totalReturnPctApprox)}</td><td>${fmtCiHtml(b?.excessReturnVsTedpixPctApprox)}</td></tr>`;
    })
    .join("");

  type TimeInMarketEntry = {
    from: string;
    to: string;
    totalDays: number;
    inMarketDays: number;
    pctInMarket: number;
    avgCapitalUtilizationPct: number;
    tedpixTop10UpDays: { date: string; tedpixChangePct: number; strategyInMarket: boolean }[];
    tedpixTop10UpDaysInMarketPct: number | null;
    tedpixTopDecileUpDaysInMarketPct: number | null;
  };
  const timeInMarket = summary.timeInMarket as { overall: TimeInMarketEntry; train: TimeInMarketEntry; test: TimeInMarketEntry };
  const timInMarketRows = (["overall", "train", "test"] as const)
    .map((key) => {
      const label = key === "overall" ? "کل بازه" : key === "train" ? "Train" : "Test";
      const t = timeInMarket[key];
      return `<tr><td>${label}</td><td>${t.totalDays}</td><td>${t.pctInMarket.toFixed(1)}%</td><td>${t.avgCapitalUtilizationPct.toFixed(1)}%</td><td>${t.tedpixTop10UpDaysInMarketPct?.toFixed(1) ?? "—"}%</td><td>${t.tedpixTopDecileUpDaysInMarketPct?.toFixed(1) ?? "—"}%</td></tr>`;
    })
    .join("");
  const timTop10Rows = timeInMarket.overall.tedpixTop10UpDays
    .map((d) => `<tr><td>${d.date}</td><td>${d.tedpixChangePct.toFixed(2)}%</td><td>${d.strategyInMarket ? "بله" : "خیر (نقد)"}</td></tr>`)
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

<h2>Train vs Test (تقسیم ${(split.trainRatio * 100).toFixed(0)}٪/${(100 - split.trainRatio * 100).toFixed(0)}٪ بر اساس تاریخ، نقطهٔ تقسیم: ${split.splitDate})</h2>
<p style="color:#f87171">هشدار: وزن قوانین فعلی روی کل بازه (بدون تفکیک train/test) تنظیم شده‌اند — این جدول فقط برای
سنجش صادقانهٔ افت عملکرد در بازهٔ test است، نه نتیجهٔ یک مدل که واقعاً فقط روی train تنظیم شده باشد.
از این پس هر تنظیم وزن جدید باید فقط ستون train را ببیند.</p>
<table><tr><th>معیار</th><th>Train</th><th>Test</th></tr>${splitRows}</table>
<table><tr><th>بنچمارک (ریالی)</th><th>بازدهٔ Train</th><th>بازدهٔ Test</th></tr>${splitBenchRows}</table>
<p style="color:#94a3b8">بند ۲ پرامپت — همان بنچمارک‌ها بعد از تعدیل با نرخ دلار همان روز (یعنی خالص از اثر سقوط ریال).
دلار خودش نسبت به خودش همیشه ۰٪ است — این عمداً یک sanity check است، نه باگ.</p>
<table><tr><th>بنچمارک (به دلار)</th><th>بازدهٔ Train</th><th>بازدهٔ Test</th></tr>${splitBenchUsdRows}</table>

<h2>بازده در برابر بنچمارک‌ها (کل بازه)</h2>
<table><tr><th>دارایی (ریالی)</th><th>بازده٪</th></tr>${benchmarkRows}</table>
<table><tr><th>دارایی (به دلار)</th><th>بازده٪</th></tr><tr><td>استراتژی</td><td>${strategyReturnPctUsdReport != null ? strategyReturnPctUsdReport.toFixed(2) + "%" : "بدون داده"}</td></tr>${benchmarkUsdRows}</table>

<h2>بند ۳ — بازهٔ اطمینان ${((bootstrap.ciLevel ?? 0.9) * 100).toFixed(0)}٪ (bootstrap، seed=${bootstrap.seed}، ${bootstrap.iterations} تکرار)</h2>
<p style="color:#94a3b8">
«بازدهٔ تقریبی» چون bootstrap ترتیب زمانی معاملات را به‌هم می‌ریزد، منحنی equity واقعی (با تا ۱۰
پوزیشن هم‌زمان) دوباره شبیه‌سازی نمی‌شود — هر معامله با سهم ثابت ${(ALLOCATION_PCT * 100).toFixed(0)}٪
از سرمایه جدا ترکیب شده؛ برای سنجش پهنای بازه کافی است، برای عدد دقیق نقطه‌ای به جدول‌های بالا
مراجعه کنید. «بازده مازاد بر تدپیکس» بازدهٔ ریالی هر resample منهای بازدهٔ ریالی واقعی تدپیکس همان
بازه است (خود تدپیکس resample نمی‌شود، چون یک دارایی منفعل است نه دنباله‌ای از معاملات مستقل).
</p>
<table><tr><th>بازه</th><th>تعداد معامله</th><th>profit factor (۵٪ … میانه … ۹۵٪)</th><th>بازدهٔ تقریبی٪</th><th>بازدهٔ مازاد بر تدپیکس٪</th></tr>${bootstrapRows}</table>

<h2>تشخیص میانی — زمان حضور در بازار در برابر نقد</h2>
<p style="color:#94a3b8">آیا استراتژی در بزرگ‌ترین روزهای رشد تدپیکس در بازار بوده یا نقد؟</p>
<table><tr><th>بازه</th><th>روز معاملاتی</th><th>٪ روز در بازار (≥۱ پوزیشن)</th><th>٪ میانگین سرمایهٔ درگیر</th><th>٪ در بازار، ۱۰ روز پررشدترین تدپیکس</th><th>٪ در بازار، دهک اول روزهای پررشد</th></tr>${timInMarketRows}</table>
<table><tr><th>تاریخ</th><th>رشد تدپیکس٪</th><th>استراتژی در بازار بود؟</th></tr>${timTop10Rows}</table>

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
