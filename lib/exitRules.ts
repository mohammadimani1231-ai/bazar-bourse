/**
 * قواعد خروج از پوزیشن — تعریف واحد و مشترک بین scripts/backtest.ts و موتور اجرای مجازی
 * (قید #۳: بدون پیاده‌سازی موازی).
 *
 * تفاوت آگاهانه و مستند بین این دو مصرف‌کننده: بک‌تست تاریخی هیچ مفهوم حد ضرر ندارد (از فاز ۳
 * این‌طور بوده) و فقط sell_signal/max_hold را دارد؛ حد ضرر ATR14×۱.۵ در فاز ۸ اضافه شد و فقط
 * پرتفوی مجازی از آن استفاده می‌کند. یعنی اعداد بک‌تست و پرتفوی مجازی از این بابت مستقیماً
 * قابل مقایسه نیستند — این تفاوت واقعی است، نه باگ.
 */

export type ExitReason = "stop_loss" | "sell_signal" | "max_hold";

export const DEFAULT_MAX_HOLD_DAYS = 20;

export function isMaxHoldReached(heldDays: number, maxHoldDays: number): boolean {
  return heldDays >= maxHoldDays;
}

export function isStopLossHit(currentPrice: number | null, stopLossPrice: number | null): boolean {
  if (currentPrice == null || stopLossPrice == null) return false;
  return currentPrice <= stopLossPrice;
}

export interface ExitDecisionInput {
  hasSellSignal: boolean;
  /** تعداد روزهای معاملاتی از ورود. */
  heldDays: number;
  maxHoldDays: number;
  currentPrice: number | null;
  stopLossPrice: number | null;
}

/**
 * اولویت عمدی: حد ضرر → سیگنال فروش → سقف مدت نگه‌داری. حد ضرر اول است چون یک قید ریسک
 * است نه یک نظر؛ سیگنال فروش قبل از max_hold است تا با ترتیب موجود بک‌تست یکی بماند
 * (آنجا هم خروج با sell_signal زودتر از حلقهٔ max_hold اجرا می‌شود).
 */
export function decideExit(input: ExitDecisionInput): ExitReason | null {
  if (isStopLossHit(input.currentPrice, input.stopLossPrice)) return "stop_loss";
  if (input.hasSellSignal) return "sell_signal";
  if (isMaxHoldReached(input.heldDays, input.maxHoldDays)) return "max_hold";
  return null;
}
