import type { EquityPoint } from "./tradeMetrics.ts";

/**
 * بازسازی منحنی سرمایهٔ روزانهٔ پرتفوی مجازی به‌صورت **مارک‌تومارکت واقعی** (نقد + ارزش
 * روز پوزیشن‌های باز)، نه فقط سود محقق‌شده.
 *
 * چرا اینجا می‌شود ولی در فاز ۸ نشد: دفتر دستی `paper_trades` قیمت روزانهٔ تاریخی
 * پوزیشن‌های باز را نداشت، ولی اینجا `daily_candles` هر نماد در دسترس است، پس ارزش هر روز
 * واقعاً قابل محاسبه است و نیازی به snapshot دوره‌ای نیست.
 *
 * ضد look-ahead: ارزش هر روز فقط با قیمت بستهٔ همان روز حساب می‌شود.
 */

export interface EquityCurveTrade {
  symbol: string;
  /** تاریخ ورود (YYYY-MM-DD). */
  entryDate: string;
  entryPrice: number;
  shareCount: number;
  /** کارمزد خرید پرداختی. */
  entryFee: number;
  /** تاریخ خروج؛ null یعنی پوزیشن هنوز باز است. */
  exitDate: string | null;
  exitPrice: number | null;
  exitFee: number | null;
}

export interface EquityCurveResult {
  points: EquityPoint[];
  /** نسبت سرمایهٔ درگیر (ارزش پوزیشن‌ها ÷ کل دارایی) در هر روز، ۰ تا ۱. */
  capitalDeployedRatioByDate: { date: string; ratio: number }[];
}

/**
 * @param calendar روزهای معاملاتی مرتب صعودی که منحنی روی آن‌ها ساخته می‌شود
 * @param closesBySymbol تاریخ→قیمت پایانی هر نماد (برای ارزش‌گذاری پوزیشن باز)
 */
export function buildVirtualEquityCurve(
  trades: EquityCurveTrade[],
  initialCapital: number,
  calendar: string[],
  closesBySymbol: Map<string, Map<string, number>>,
): EquityCurveResult {
  const points: EquityPoint[] = [];
  const capitalDeployedRatioByDate: { date: string; ratio: number }[] = [];

  for (const date of calendar) {
    let cash = initialCapital;
    let positionsValue = 0;

    for (const t of trades) {
      if (t.entryDate > date) continue; // هنوز باز نشده
      cash -= t.shareCount * t.entryPrice + t.entryFee;

      const closed = t.exitDate != null && t.exitDate <= date;
      if (closed) {
        cash += t.shareCount * (t.exitPrice ?? t.entryPrice) - (t.exitFee ?? 0);
      } else {
        // هنوز باز است — با قیمت بستهٔ همین روز ارزش‌گذاری می‌شود؛ اگر آن روز کندل نداشت
        // (توقف نماد)، آخرین قیمت شناخته‌شده یعنی قیمت ورود مبنا می‌ماند.
        const close = closesBySymbol.get(t.symbol)?.get(date) ?? t.entryPrice;
        positionsValue += t.shareCount * close;
      }
    }

    const equity = cash + positionsValue;
    points.push({ date, equity });
    capitalDeployedRatioByDate.push({ date, ratio: equity > 0 ? positionsValue / equity : 0 });
  }

  return { points, capitalDeployedRatioByDate };
}
