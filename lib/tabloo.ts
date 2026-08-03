import type { QuoteRow } from "./transforms/quote.ts";
import type { DailyCandleRow } from "./transforms/candle.ts";

function average(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** پرسنتایل خطی (روش نزدیک به numpy 'linear') روی آرایه‌ای از اعداد. */
function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

// ============================================================
// ۱. سرانه خرید/فروش حقیقی
// ============================================================

export function perCapitaBuy(
  row: Pick<QuoteRow, "buy_i_volume" | "close_price" | "buy_count_i">,
): number | null {
  if (!row.buy_count_i || row.buy_i_volume == null || row.close_price == null) return null;
  return (row.buy_i_volume * row.close_price) / row.buy_count_i;
}

export function perCapitaSell(
  row: Pick<QuoteRow, "sell_i_volume" | "close_price" | "sell_count_i">,
): number | null {
  if (!row.sell_count_i || row.sell_i_volume == null || row.close_price == null) return null;
  return (row.sell_i_volume * row.close_price) / row.sell_count_i;
}

// ============================================================
// ۲. قدرت خریدار حقیقی = سرانه خرید ÷ سرانه فروش
// ============================================================

export function buyerPower(perCapitaBuyValue: number | null, perCapitaSellValue: number | null): number | null {
  if (perCapitaBuyValue == null || perCapitaSellValue == null || perCapitaSellValue === 0) return null;
  return perCapitaBuyValue / perCapitaSellValue;
}

// ============================================================
// ۳. ورود/خروج پول حقیقی
// ============================================================

export function moneyFlow(
  row: Pick<QuoteRow, "buy_i_volume" | "sell_i_volume" | "close_price">,
): number | null {
  if (row.buy_i_volume == null || row.sell_i_volume == null || row.close_price == null) return null;
  return (row.buy_i_volume - row.sell_i_volume) * row.close_price;
}

/** تجمیع ورود/خروج پول حقیقی به تفکیک صنعت. ردیف‌های بدون moneyFlow نادیده گرفته می‌شوند. */
export function moneyFlowByIndustry(
  rows: { symbol: string; moneyFlow: number | null }[],
  industryOf: Map<string, string | null>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const r of rows) {
    if (r.moneyFlow == null) continue;
    const industry = industryOf.get(r.symbol) ?? "نامشخص";
    totals[industry] = (totals[industry] ?? 0) + r.moneyFlow;
  }
  return totals;
}

// ============================================================
// ۴. حجم مشکوک — میانگین‌ها را از ردیف‌های واقعی daily_candles بگیر
// (که خودش فقط روزهای معاملاتی واقعی دارد)، نه از بازهٔ تقویمی محاسبه‌شده.
// ============================================================

export interface SuspiciousVolumeResult {
  suspicious: boolean | null;
  avg3m: number | null;
  avg12m: number | null;
}

/**
 * last3mCandles/last12mCandles باید همان ردیف‌های واقعیِ آخرین ~۶۰ و ~۲۴۰ روز معاملاتیِ
 * موجود در daily_candles باشند (کوئری `order by date desc limit N`) — نه بازهٔ تقویمی،
 * چون تعطیلات/شکاف‌های پایپ‌لاین باعث حذف نادرست روز نمی‌شود.
 */
export function isSuspiciousVolume(
  todayVolume: number | null,
  last3mCandles: Pick<DailyCandleRow, "volume">[],
  last12mCandles: Pick<DailyCandleRow, "volume">[],
): SuspiciousVolumeResult {
  const avg3m = average(last3mCandles.map((c) => c.volume));
  const avg12m = average(last12mCandles.map((c) => c.volume));

  const suspicious =
    todayVolume == null || avg3m == null || avg12m == null
      ? null
      : todayVolume > avg3m && todayVolume > 2 * avg12m;

  return { suspicious, avg3m, avg12m };
}

// ============================================================
// ۵. پول درشت — سرانه خریدار امروز بالای پرسنتایل ۹۰ توزیع ۳۰ روز اخیر همان نماد
// ============================================================

const WHALE_MIN_SAMPLE = 5;

export interface WhaleResult {
  isWhale: boolean | null;
  percentile90: number | null;
  sampleSize: number;
}

/**
 * last30DaysPerCapitaBuys باید سرانهٔ خرید حقیقیِ همان نماد در تا ۳۰ روز معاملاتی اخیر باشد.
 * اگر نمونه کوچک‌تر از WHALE_MIN_SAMPLE بود، isWhale=null برمی‌گردد (نه false) — یعنی
 * «داده ناکافی»، نه «خریدار درشت نیست». پرسنتایلی است طبق قید CLAUDE.md، نه تومان ثابت.
 */
export function isWhaleBuyer(
  todayPerCapitaBuy: number | null,
  last30DaysPerCapitaBuys: (number | null)[],
): WhaleResult {
  const sample = last30DaysPerCapitaBuys.filter((v): v is number => v != null && Number.isFinite(v));

  if (todayPerCapitaBuy == null || sample.length < WHALE_MIN_SAMPLE) {
    return { isWhale: null, percentile90: null, sampleSize: sample.length };
  }

  const p90 = percentile(sample, 90);
  return { isWhale: p90 == null ? null : todayPerCapitaBuy > p90, percentile90: p90, sampleSize: sample.length };
}

// ============================================================
// ۶. کد به کد حقوقی→حقیقی — هرگز سیگنال مستقل نیست، فقط پرچم اطلاع‌رسان
// برای بررسی بیشتر توسط کاربر یا فاز ۳ (کنار سایر متریک‌ها).
// ============================================================

export function isCodeToCode(
  row: Pick<QuoteRow, "buy_i_volume" | "sell_n_volume" | "volume">,
): boolean | null {
  if (row.buy_i_volume == null || row.sell_n_volume == null || !row.volume) return null;
  return row.buy_i_volume > 0.5 * row.volume && row.sell_n_volume > 0.5 * row.volume;
}

// ============================================================
// ۷. وضعیت صف + سرعت صف
// ============================================================

export interface QueueState {
  lockedBuy: boolean | null;
  heavy: boolean | null;
}

export function queueState(
  row: Pick<QuoteRow, "bid1_price" | "price_max" | "bid1_volume" | "base_volume">,
): QueueState {
  const lockedBuy =
    row.bid1_price != null && row.price_max != null ? row.bid1_price === row.price_max : null;
  const heavy =
    row.bid1_volume != null && row.base_volume != null ? row.bid1_volume >= row.base_volume : null;
  return { lockedBuy, heavy };
}

export interface QueueVelocity {
  bidVolumeChange: number | null;
  askVolumeChange: number | null;
  secondsBetween: number | null;
}

/** current باید اسنپ‌شات جدیدتر و previous اسنپ‌شات قبلیِ همان نماد باشد. */
export function queueVelocity(
  current: Pick<QuoteRow, "bid1_volume" | "ask1_volume" | "captured_at">,
  previous: Pick<QuoteRow, "bid1_volume" | "ask1_volume" | "captured_at">,
): QueueVelocity {
  const bidVolumeChange =
    current.bid1_volume != null && previous.bid1_volume != null
      ? current.bid1_volume - previous.bid1_volume
      : null;
  const askVolumeChange =
    current.ask1_volume != null && previous.ask1_volume != null
      ? current.ask1_volume - previous.ask1_volume
      : null;
  const secondsBetween =
    (new Date(current.captured_at).getTime() - new Date(previous.captured_at).getTime()) / 1000;

  return {
    bidVolumeChange,
    askVolumeChange,
    secondsBetween: Number.isFinite(secondsBetween) ? secondsBetween : null,
  };
}

// ============================================================
// ۸. سرانه تجمیعی بازار + تشخیص کراس
// ============================================================

export interface MarketPerCapita {
  buyPerCapita: number | null;
  sellPerCapita: number | null;
}

/** سرانهٔ بازار = مجموع ارزش خرید/فروش حقیقی همهٔ نمادها ÷ مجموع تعداد کد خریدار/فروشندهٔ حقیقی. */
export function marketPerCapita(
  rows: Pick<QuoteRow, "buy_i_volume" | "sell_i_volume" | "buy_count_i" | "sell_count_i" | "close_price">[],
): MarketPerCapita {
  let buyValueSum = 0;
  let buyCountSum = 0;
  let sellValueSum = 0;
  let sellCountSum = 0;
  let hasBuy = false;
  let hasSell = false;

  for (const r of rows) {
    if (r.buy_i_volume != null && r.close_price != null && r.buy_count_i) {
      buyValueSum += r.buy_i_volume * r.close_price;
      buyCountSum += r.buy_count_i;
      hasBuy = true;
    }
    if (r.sell_i_volume != null && r.close_price != null && r.sell_count_i) {
      sellValueSum += r.sell_i_volume * r.close_price;
      sellCountSum += r.sell_count_i;
      hasSell = true;
    }
  }

  return {
    buyPerCapita: hasBuy && buyCountSum > 0 ? buyValueSum / buyCountSum : null,
    sellPerCapita: hasSell && sellCountSum > 0 ? sellValueSum / sellCountSum : null,
  };
}

export interface MarketPerCapitaPoint {
  capturedAt: string;
  buyPerCapita: number | null;
  sellPerCapita: number | null;
}

export interface CrossoverEvent {
  capturedAt: string;
  direction: "buy_over_sell" | "sell_over_buy";
}

/** نقاطی که خط سرانه خرید و فروش تجمیعی بازار در طول جلسه جابه‌جا می‌شوند (رویداد رژیمی). */
export function detectCrossovers(series: MarketPerCapitaPoint[]): CrossoverEvent[] {
  const sorted = [...series].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const events: CrossoverEvent[] = [];
  let prevSign: number | null = null;

  for (const point of sorted) {
    if (point.buyPerCapita == null || point.sellPerCapita == null) continue;
    const diff = point.buyPerCapita - point.sellPerCapita;
    const sign = diff > 0 ? 1 : diff < 0 ? -1 : 0;

    if (sign !== 0 && prevSign !== null && sign !== prevSign) {
      events.push({ capturedAt: point.capturedAt, direction: sign > 0 ? "buy_over_sell" : "sell_over_buy" });
    }
    if (sign !== 0) prevSign = sign;
  }

  return events;
}
