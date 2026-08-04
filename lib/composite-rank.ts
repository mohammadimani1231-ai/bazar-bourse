import { ema, rsi, roc, ppo } from "./indicators.ts";

export interface RankComponents {
  distFromEma200Pct: number | null;
  roc125: number | null;
  distFromEma50Pct: number | null;
  roc20: number | null;
  ppoHistSlope3: number | null;
  rsi14: number | null;
}

export interface RawScoreResult {
  rawScore: number | null;
  components: RankComponents;
}

/**
 * نمرهٔ خام رتبهٔ فنی مرکب یک نماد (اقتباس از SCTR استاک‌چارتز)، از سری adjusted_close
 * کندل‌های بستهٔ همان نماد به ترتیب قدیم→جدید. حداقل ۲۰۰ کندل لازم است (برای EMA200)،
 * وگرنه rawScore=null. مثل خود SCTR، مقیاس اجزا قبل از جمع نرمال نمی‌شود — چون در نهایت
 * فقط رتبهٔ پرسنتایلی (percentileRank) بین نمادها مهم است، نه مقدار مطلق rawScore.
 *
 * وزن‌ها: بلندمدت ۶۰٪ (فاصله از EMA200 ×۳۰٪ + ROC125 ×۳۰٪)، میان‌مدت ۳۰٪
 * (فاصله از EMA50 ×۱۵٪ + ROC20 ×۱۵٪)، کوتاه‌مدت ۱۰٪ (شیب ۳روزهٔ هیستوگرام PPO ×۵٪ + RSI14 ×۵٪).
 */
export function computeRawScore(closes: number[]): RawScoreResult {
  const n = closes.length;
  const empty: RankComponents = {
    distFromEma200Pct: null,
    roc125: null,
    distFromEma50Pct: null,
    roc20: null,
    ppoHistSlope3: null,
    rsi14: null,
  };
  if (n < 200) return { rawScore: null, components: empty };

  const last = closes[n - 1];
  const ema200 = ema(closes, 200);
  const ema50 = ema(closes, 50);
  const rsi14Series = rsi(closes, 14);
  const roc125 = roc(closes, 125)[n - 1];
  const roc20 = roc(closes, 20)[n - 1];
  const rsi14 = rsi14Series[n - 1];
  const hist = ppo(closes, 12, 26, 9).histogram;
  const ppoHistSlope3 = n >= 4 ? hist[n - 1] - hist[n - 4] : null;

  const distFromEma200Pct = ((last - ema200[n - 1]) / ema200[n - 1]) * 100;
  const distFromEma50Pct = ((last - ema50[n - 1]) / ema50[n - 1]) * 100;

  const components: RankComponents = { distFromEma200Pct, roc125, distFromEma50Pct, roc20, ppoHistSlope3, rsi14 };

  if (roc125 == null || roc20 == null || rsi14 == null || ppoHistSlope3 == null) {
    return { rawScore: null, components };
  }

  const rawScore =
    distFromEma200Pct * 0.3 +
    roc125 * 0.3 +
    distFromEma50Pct * 0.15 +
    roc20 * 0.15 +
    ppoHistSlope3 * 0.05 +
    rsi14 * 0.05;

  return { rawScore, components };
}

export interface RankedSymbol {
  symbol: string;
  rawScore: number;
  rank: number;
}

/** رتبهٔ پرسنتایلی ۰ تا ۹۹ نسبت به بقیهٔ watchlist؛ ورودی‌های rawScore=null کنار گذاشته می‌شوند. */
export function percentileRank(scores: { symbol: string; rawScore: number | null }[]): RankedSymbol[] {
  const valid = scores.filter((s): s is { symbol: string; rawScore: number } => s.rawScore != null);
  const sorted = [...valid].sort((a, b) => a.rawScore - b.rawScore);
  const n = sorted.length;
  return sorted.map((s, i) => ({
    symbol: s.symbol,
    rawScore: s.rawScore,
    rank: n <= 1 ? 99 : Math.round((i / (n - 1)) * 99),
  }));
}
