/**
 * اندیکاتورهای فنی خالص — ورودی همیشه باید سری adjusted_close کندل‌های بسته‌شده باشد
 * (کندل امروزِ هنوز درحال‌شکل‌گیری هرگز نباید در این آرایه باشد — قید ضد-repainting CLAUDE.md).
 * فرمول‌ها با pandas.Series.ewm(adjust=False) مو‌به‌مو یکسان‌اند (رجوع کن به lib/indicators.test.ts).
 */

/** EMA استاندارد: seed = اولین مقدار خام، ضریب هموارسازی alpha = 2/(period+1). */
export function ema(values: number[], period: number): number[] {
  const alpha = 2 / (period + 1);
  const result: number[] = new Array(values.length);
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : (values[i] - prev) * alpha + prev;
    result[i] = prev;
  }
  return result;
}

/**
 * RSI به روش Wilder (alpha = 1/period، نه EMA معمولی span-based).
 * حداقل period+1 مقدار لازم است؛ اندیس‌های قبل از آن null‌اند.
 */
export function rsi(values: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period + 1) return result;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);

    if (i === 1) {
      avgGain = gain;
      avgLoss = loss;
    } else {
      avgGain = avgGain + (gain - avgGain) / period;
      avgLoss = avgLoss + (loss - avgLoss) / period;
    }

    if (i >= period) {
      result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
  }

  return result;
}

/** نرخ تغییر: (قیمت امروز / قیمت period روز قبل - ۱) × ۱۰۰. اندیس‌های قبل از period، null. */
export function roc(values: number[], period: number): (number | null)[] {
  return values.map((v, i) => {
    if (i < period) return null;
    const prev = values[i - period];
    if (!prev) return null;
    return ((v - prev) / prev) * 100;
  });
}

export interface PpoResult {
  ppo: number[];
  signal: number[];
  histogram: number[];
}

/** PPO(fast,slow,signal): خط PPO = (EMA_fast - EMA_slow)/EMA_slow × ۱۰۰؛ سیگنال = EMA(signalPeriod) روی PPO. */
export function ppo(values: number[], fast = 12, slow = 26, signalPeriod = 9): PpoResult {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const ppoLine = values.map((_, i) => ((emaFast[i] - emaSlow[i]) / emaSlow[i]) * 100);
  const signalLine = ema(ppoLine, signalPeriod);
  const histogram = ppoLine.map((v, i) => v - signalLine[i]);
  return { ppo: ppoLine, signal: signalLine, histogram };
}

export interface FiftyTwoWeekDistance {
  pctFromHigh: number | null;
  pctFromLow: number | null;
}

/** فاصلهٔ درصدی قیمت فعلی از سقف/کف ۵۲ هفتهٔ اخیر (پیش‌فرض ۲۵۲ روز معاملاتی) بر اساس high/low روزانه. */
export function distanceFrom52Week(
  currentClose: number,
  highs: number[],
  lows: number[],
  period = 252,
): FiftyTwoWeekDistance {
  if (highs.length === 0 || lows.length === 0) return { pctFromHigh: null, pctFromLow: null };
  const high52w = Math.max(...highs.slice(-period));
  const low52w = Math.min(...lows.slice(-period));
  return {
    pctFromHigh: high52w === 0 ? null : ((currentClose - high52w) / high52w) * 100,
    pctFromLow: low52w === 0 ? null : ((currentClose - low52w) / low52w) * 100,
  };
}
