/** بازده لگاریتمی متوالی یک سری قیمت (طول خروجی = طول ورودی - ۱) */
export function logReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    const cur = prices[i];
    // مقدار نامعتبر (صفر/منفی، مثلا شکاف دیتا) خنثی فرض می‌شود، نه حذف —
    // برای اینکه طول سری با سری‌های دیگر هم‌تراز بماند.
    out.push(prev > 0 && cur > 0 ? Math.log(cur / prev) : 0);
  }
  return out;
}

/** ضریب همبستگی پیرسون؛ اگر طول کافی نبود یا واریانس صفر بود، null */
export function pearsonCorrelation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;

  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA === 0 || varB === 0) return null;
  return cov / Math.sqrt(varA * varB);
}

/** همبستگی غلتان با پنجرهٔ ثابت؛ خروجی هم‌طول با ورودی، اندیس‌های قبل از پنجرهٔ اول null */
export function rollingCorrelation(
  a: number[],
  b: number[],
  window: number,
): (number | null)[] {
  const n = Math.min(a.length, b.length);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = window - 1; i < n; i++) {
    out[i] = pearsonCorrelation(a.slice(i - window + 1, i + 1), b.slice(i - window + 1, i + 1));
  }
  return out;
}

export interface CcfPoint {
  lag: number;
  correlation: number | null;
  n: number;
}

/**
 * تابع همبستگی متقاطع (CCF) بین دو سری هم‌طول برای لگ‌های [-maxLag, +maxLag].
 * قرارداد: در لگ مثبت L، leader[t] با follower[t+L] جفت می‌شود — یعنی همبستگی بالا
 * در L>0 یعنی «leader جلوتر از follower حرکت می‌کند» (leader را L روز جلو می‌بریم).
 */
export function crossCorrelation(
  leader: number[],
  follower: number[],
  maxLag: number,
): CcfPoint[] {
  const n = Math.min(leader.length, follower.length);
  const results: CcfPoint[] = [];
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const a: number[] = [];
    const b: number[] = [];
    for (let t = 0; t < n; t++) {
      const f = t + lag;
      if (f < 0 || f >= n) continue;
      a.push(leader[t]);
      b.push(follower[f]);
    }
    results.push({ lag, correlation: pearsonCorrelation(a, b), n: a.length });
  }
  return results;
}

/** لگی که در آن قدرمطلق همبستگی بیشینه است (برای annotation لگ بهینه) */
export function bestLag(points: CcfPoint[]): CcfPoint | null {
  let best: CcfPoint | null = null;
  for (const p of points) {
    if (p.correlation === null) continue;
    if (!best || best.correlation === null || Math.abs(p.correlation) > Math.abs(best.correlation)) {
      best = p;
    }
  }
  return best;
}
