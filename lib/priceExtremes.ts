/**
 * فاصلهٔ قیمت فعلی تا سقف ۳ماهه/سالانه — فقط نمایشی (به lib/signal-engine.ts وصل نشده،
 * قرارداد آن یک تصمیم جداست). بیشینه روی «قیمت پایانی» (final_price ستون daily_candles)
 * محاسبه می‌شود، نه adjusted_close — چون این عدد قرار است دقیقاً همان چیزی باشد که در
 * tsetmc دیده می‌شود، نه نسخهٔ تعدیل‌شدهٔ بک‌تست.
 */

export const THREE_MONTH_TRADING_DAYS = 63;
export const ONE_YEAR_TRADING_DAYS = 250;

export interface DistanceFromHighResult {
  high: number | null;
  /** (قیمت فعلی − سقف) ÷ سقف × ۱۰۰ — منفی یعنی زیر سقف، صفر یا مثبت یعنی روی سقف/رکورد جدید. */
  distancePct: number | null;
}

/**
 * `closesAscending` باید قیمت‌های پایانیِ صعودی-زمانیِ N روز معاملاتیِ اخیر (قدیم به جدید) باشد
 * — تابع خودش فقط `windowDays` تای آخر را برمی‌دارد، پس صدازننده می‌تواند یک آرایهٔ بلندتر
 * مشترک بین چند بازه (مثلاً ۲۵۰ روزه) بدهد و این تابع را هم با ۶۳ هم با ۲۵۰ صدا بزند.
 */
export function distanceFromHigh(
  currentPrice: number | null,
  closesAscending: number[],
  windowDays: number,
): DistanceFromHighResult {
  if (currentPrice == null || closesAscending.length === 0) return { high: null, distancePct: null };

  const window = closesAscending.slice(-windowDays);
  const high = Math.max(...window);
  if (!Number.isFinite(high) || high <= 0) return { high: null, distancePct: null };

  return { high, distancePct: ((currentPrice - high) / high) * 100 };
}
