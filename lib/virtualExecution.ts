import type { QueueState } from "./tabloo.ts";
import { tehranDayBounds } from "./time/tehranDay.ts";

/**
 * منطق خالص اجرای مجازی سفارش‌ها (پرتفوی مجازی خودکار — قانون #۱۴ CLAUDE.md).
 * هیچ I/O ندارد تا هم قابل تست واحد باشد و هم Edge Function و هر مصرف‌کنندهٔ دیگری
 * دقیقاً همین منطق را صدا بزند (بدون پیاده‌سازی موازی، قید #۳).
 */

export type VirtualExecutionStatus =
  | "executed"
  | "partial"
  | "pending_queue"
  | "rejected_liquidity"
  | "rejected_max_positions"
  | "rejected_stale_data";

/**
 * فهرست کامل مقادیر ستون virtual_trades.status (ستون text بدون CHECK است، پس این‌جا منبع
 * مستندسازی است): مقادیر بالا به‌علاوهٔ `expired_queue` (سفارش صف منقضی‌شده) و `closed`.
 */

/**
 * آیا این کوت مال همان روز تقویمی تهرانِ «الان» است؟
 *
 * چرا لازم است (باگ واقعی، نه احتیاط نظری): گارد بازار (`lib/market-status.ts::isMarketOpen`)
 * سه لایه دارد — بازهٔ نظری، جدول تعطیلات، و heuristic تغییر حجم — ولی لایهٔ سوم وقتی کمتر از
 * دو اسنپ‌شات اخیر موجود باشد **کاملاً رد می‌شود** و بازار «باز» فرض می‌شود. در یک تعطیلی
 * ثبت‌نشده که هم‌زمان collect-tse هم قطع باشد (که سابقهٔ مستند دارد)، این یعنی اجرا روی قیمت
 * دیروز. مهم‌تر: حتی وقتی بازار **واقعاً باز است**، آخرین کوت یک نماد متوقف (مثل فولاد که از
 * ۱۴۰۴/۱۲/۰۶ متوقف است) می‌تواند مال ماه‌ها قبل باشد — چیزی که گارد بازار اصلاً نمی‌بیند چون
 * سراسری است، نه per-symbol.
 */
export function isQuoteFromToday(capturedAt: string, nowUtc: Date): boolean {
  return tehranDayBounds(new Date(capturedAt)).date === tehranDayBounds(nowUtc).date;
}

export interface VirtualExecutionInput {
  /** نقد آزاد پرتفوی در لحظهٔ تصمیم. */
  cash: number;
  openPositionCount: number;
  maxConcurrentPositions: number;
  /** خروجی lib/position-sizing.ts::calculatePositionSize — سقف‌های ریسک از قبل اعمال شده. */
  desiredShareCount: number;
  /** قیمت اجرای فرضی (last price در لحظهٔ تصمیم). */
  price: number;
  buyFeePct: number;
  queue: Pick<QueueState, "lockedBuy">;
}

export interface VirtualExecutionDecision {
  status: VirtualExecutionStatus;
  shareCount: number;
  grossValue: number;
  fee: number;
  /** برای خرید: ارزش ناخالص + کارمزد (کل نقدی که از پرتفوی کم می‌شود). */
  totalCost: number;
  note: string;
}

export interface FeeBreakdown {
  gross: number;
  fee: number;
  /** خرید: gross + fee (پرداختی). فروش: gross − fee (دریافتی). */
  net: number;
}

export function buyCost(shareCount: number, price: number, buyFeePct: number): FeeBreakdown {
  const gross = shareCount * price;
  const fee = gross * (buyFeePct / 100);
  return { gross, fee, net: gross + fee };
}

export function sellProceeds(shareCount: number, price: number, sellFeePct: number): FeeBreakdown {
  const gross = shareCount * price;
  const fee = gross * (sellFeePct / 100);
  return { gross, fee, net: gross - fee };
}

/** بیشترین تعداد سهم قابل خرید با نقد موجود، با احتساب کارمزد خرید. */
export function maxAffordableShares(cash: number, price: number, buyFeePct: number): number {
  if (cash <= 0 || price <= 0) return 0;
  return Math.floor(cash / (price * (1 + buyFeePct / 100)));
}

/**
 * تصمیم اجرای یک سیگنال خرید. ترتیب بررسی عمدی است: ظرفیت پوزیشن → قفل صف → نقدینگی.
 * قفل صف قبل از نقدینگی چک می‌شود چون وقتی نماد صف خرید قفل است اصلاً امکان معامله نیست،
 * پس «رد به دلیل کمبود نقدینگی» برچسب گمراه‌کننده‌ای می‌شد.
 */
export function decideBuyExecution(input: VirtualExecutionInput): VirtualExecutionDecision {
  const { cash, openPositionCount, maxConcurrentPositions, desiredShareCount, price, buyFeePct, queue } = input;
  const empty = { shareCount: 0, grossValue: 0, fee: 0, totalCost: 0 };

  if (openPositionCount >= maxConcurrentPositions) {
    return {
      ...empty,
      status: "rejected_max_positions",
      note: `سقف پوزیشن هم‌زمان (${maxConcurrentPositions}) پر است`,
    };
  }

  if (queue.lockedBuy === true) {
    return { ...empty, status: "pending_queue", note: "صف خرید قفل است — سفارش در انتظار باز شدن صف" };
  }

  if (desiredShareCount <= 0 || price <= 0) {
    return { ...empty, status: "rejected_liquidity", note: "اندازهٔ پوزیشن محاسبه‌شده صفر است" };
  }

  const affordable = maxAffordableShares(cash, price, buyFeePct);
  if (affordable <= 0) {
    return { ...empty, status: "rejected_liquidity", note: "نقد کافی برای حتی یک سهم وجود ندارد" };
  }

  const shareCount = Math.min(desiredShareCount, affordable);
  const { gross, fee, net } = buyCost(shareCount, price, buyFeePct);

  if (shareCount < desiredShareCount) {
    return {
      status: "partial",
      shareCount,
      grossValue: gross,
      fee,
      totalCost: net,
      note: `نقد کافی نبود — اندازه از ${desiredShareCount} به ${shareCount} سهم کاهش یافت`,
    };
  }

  return { status: "executed", shareCount, grossValue: gross, fee, totalCost: net, note: "اجرا شد" };
}

/**
 * سفارش خریدِ در انتظار صف: هر روز معاملاتی یک‌بار صدا زده می‌شود.
 * waitDays شمارندهٔ روزهای معاملاتی سپری‌شده است، نه روز تقویمی — چون این تابع فقط وقتی
 * بازار باز است اجرا می‌شود، تعطیلات خودبه‌خود شمرده نمی‌شوند.
 */
export function shouldExpirePending(waitDays: number, maxWaitDays: number): boolean {
  return waitDays >= maxWaitDays;
}

/** سود/زیان محقق‌شدهٔ خالص یک پوزیشن بسته‌شده (هر دو کارمزد کسر شده). */
export function realizedPnl(params: {
  shareCount: number;
  entryPrice: number;
  exitPrice: number;
  buyFeePct: number;
  sellFeePct: number;
}): { pnl: number; returnPct: number; entryFee: number; exitFee: number } {
  const entry = buyCost(params.shareCount, params.entryPrice, params.buyFeePct);
  const exit = sellProceeds(params.shareCount, params.exitPrice, params.sellFeePct);
  const pnl = exit.net - entry.net;
  return {
    pnl,
    returnPct: entry.net === 0 ? 0 : (pnl / entry.net) * 100,
    entryFee: entry.fee,
    exitFee: exit.fee,
  };
}
