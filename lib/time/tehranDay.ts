const TEHRAN_OFFSET_MINUTES = 3 * 60 + 30;

export interface TehranDayBounds {
  date: string;
  startUtc: string;
  endUtc: string;
}

/**
 * بازهٔ یک روز تقویمی تهران را برحسب UTC برمی‌گرداند (برای برش quotes یک روز معاملاتی).
 * ایران از ۱۴۰۰ دیگر تغییر ساعت تابستانی ندارد، پس افست +۳:۳۰ ثابت است.
 */
export function tehranDayBounds(utcNow: Date): TehranDayBounds {
  const tehranNow = new Date(utcNow.getTime() + TEHRAN_OFFSET_MINUTES * 60_000);
  const y = tehranNow.getUTCFullYear();
  const m = tehranNow.getUTCMonth();
  const d = tehranNow.getUTCDate();
  const tehranMidnightUtcMs = Date.UTC(y, m, d, 0, 0, 0) - TEHRAN_OFFSET_MINUTES * 60_000;

  return {
    date: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    startUtc: new Date(tehranMidnightUtcMs).toISOString(),
    endUtc: new Date(tehranMidnightUtcMs + 24 * 60 * 60_000).toISOString(),
  };
}
