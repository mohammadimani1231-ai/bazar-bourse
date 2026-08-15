/**
 * تشخیص وقفهٔ معاملاتی بزرگ همراه با جهش/افت قیمت (نشانهٔ محتمل توقف نماد/افزایش سرمایه)
 * در یک بازهٔ محاسبهٔ بازدهی — کشف‌شده حین بررسی «بازدهی ۱ساله ۴۱٪- پارسان» (۲۰۲۶-۰۸-۱۵):
 * `adjusted_close` در این پروژه split-adjustment واقعی اعمال نمی‌کند، پس بازدهی محاسبه‌شده
 * روی چنین بازه‌ای گمراه‌کننده است، نه یک عدد واقعی افت/رشد ارگانیک.
 */

export const CONTINUITY_GAP_DAYS = 10;
export const CONTINUITY_JUMP_PCT = 30;

export interface ContinuityGap {
  prevDate: string;
  date: string;
  gapDays: number;
  /** درصد تغییر خام بین دو طرف وقفه — فقط برای تشخیص، هرگز در UI به‌عنوان عدد قابل‌اتکا نشان داده نشود. */
  jumpPct: number;
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * `closes` نیازی به مرتب‌بودن ندارد؛ فقط ردیف‌های با `close` غیر-null و در بازهٔ
 * [fromDate, toDate] در نظر گرفته می‌شوند. اولین وقفهٔ پیداشده را برمی‌گرداند (کافی برای caveat).
 */
export function findContinuityGap(
  closes: { date: string; close: number | null }[],
  fromDate: string,
  toDate: string,
): ContinuityGap | null {
  const valid = closes
    .filter((c) => c.close != null && c.date >= fromDate && c.date <= toDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  for (let i = 1; i < valid.length; i++) {
    const prev = valid[i - 1];
    const cur = valid[i];
    const gapDays = daysBetween(prev.date, cur.date);
    if (gapDays <= CONTINUITY_GAP_DAYS) continue;
    const jumpPct = ((cur.close! - prev.close!) / prev.close!) * 100;
    if (Math.abs(jumpPct) > CONTINUITY_JUMP_PCT) {
      return { prevDate: prev.date, date: cur.date, gapDays, jumpPct: Number(jumpPct.toFixed(1)) };
    }
  }
  return null;
}
