import type { QuoteRow } from "./quote.ts";

export interface DailyCandleRow {
  symbol: string;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  final_price: number | null;
  volume: number | null;
  value: number | null;
  buy_i_volume: number | null;
  sell_i_volume: number | null;
  buy_count_i: number | null;
  sell_count_i: number | null;
  adjusted_close: number | null;
}

/**
 * از اسنپ‌شات‌های quotes یک نماد در یک روز، یک کندل روزانه می‌سازد.
 * tvol/tval/Buy_I_Volume/... در پاسخ BrsApi تجمعی از ابتدای روزند، پس فقط آخرین اسنپ‌شات روز
 * برای volume/value/counts/close کافی است؛ open از اولین و high/low از بیشینه/کمینهٔ last_price
 * در طول روز به‌دست می‌آید. adjusted_close فعلاً برابر قیمت پایانی رسمی (final_price) است —
 * تعدیل واقعی برای افزایش سرمایه/سود نقدی در فاز بعد که دیتای corporate action داریم.
 */
export function buildDailyCandle(
  symbol: string,
  date: string,
  dayQuotes: QuoteRow[],
): DailyCandleRow | null {
  if (dayQuotes.length === 0) return null;

  const sorted = [...dayQuotes].sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const prices = sorted
    .map((q) => q.last_price)
    .filter((p): p is number => typeof p === "number");

  return {
    symbol,
    date,
    open: first.last_price,
    high: prices.length > 0 ? Math.max(...prices) : null,
    low: prices.length > 0 ? Math.min(...prices) : null,
    close: last.last_price,
    final_price: last.close_price,
    volume: last.volume,
    value: last.value,
    buy_i_volume: last.buy_i_volume,
    sell_i_volume: last.sell_i_volume,
    buy_count_i: last.buy_count_i,
    sell_count_i: last.sell_count_i,
    adjusted_close: last.close_price,
  };
}

export interface SeriesPoint {
  capturedAt: string;
  value: number | null;
}

export interface SimpleOhlc {
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * از اسنپ‌شات‌های عددی یک روز (مثلاً شاخص کل از market_index_quotes)، OHLC می‌سازد — همان اصل
 * buildDailyCandle بالا (open=اول، close=آخر، high/low=بیشینه/کمینه) ولی برای سری‌های تک‌مقداری
 * که ستون‌های نماد (حجم/ارزش/حقیقی-حقوقی) ندارند، پس یک تابع جدا و ساده‌تر.
 */
export function buildOhlcFromSeries(points: SeriesPoint[]): SimpleOhlc | null {
  const valid = points.filter((p): p is { capturedAt: string; value: number } => p.value != null);
  if (valid.length === 0) return null;

  const sorted = [...valid].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const values = sorted.map((p) => p.value);

  return {
    open: values[0],
    high: Math.max(...values),
    low: Math.min(...values),
    close: values[values.length - 1],
  };
}
