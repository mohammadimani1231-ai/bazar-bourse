import { getMonth } from "date-fns-jalali";

export const JALALI_MONTH_NAMES = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

/**
 * ماه شمسی (۱ تا ۱۲) یک تاریخ تقویمی YYYY-MM-DD (نه timestamp با ساعت). چون این‌جا فقط یک
 * «روز» داریم نه یک لحظه، مسئلهٔ timezone مثل lib/jalali.ts مطرح نیست — فقط با سازندهٔ محلی
 * Date کار می‌کنیم که مستقل از timezone سیستم است (y/m/d عیناً همان چیزی می‌ماند که وارد شده).
 */
export function jalaliMonthOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wallClock = new Date(y, m - 1, d);
  return getMonth(wallClock) + 1;
}

export function jalaliMonthName(monthNumber: number): string {
  return JALALI_MONTH_NAMES[monthNumber - 1] ?? String(monthNumber);
}
