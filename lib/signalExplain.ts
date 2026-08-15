export interface RuleEvaluationLike {
  rule: string;
  triggered: boolean;
  contribution?: number;
  detail?: Record<string, unknown> | null;
}

const RULE_TEMPLATES: Record<string, string> = {
  rsi_oversold: "RSI۱۴ زیر ۳۰ است — نماد در ناحیهٔ اشباع فروش قرار دارد.",
  rsi_overbought: "RSI۱۴ بالای ۷۰ است — نماد در ناحیهٔ اشباع خرید قرار دارد.",
  ema_cross_up: "میانگین متحرک نمایی ۹روزه از ۲۶روزه رو به بالا عبور کرده (کراس صعودی).",
  ema_cross_down: "میانگین متحرک نمایی ۹روزه از ۲۶روزه رو به پایین عبور کرده (کراس نزولی).",
  suspicious_volume: "حجم معاملات امروز به‌طور غیرعادی بالاتر از میانگین ۳ و ۱۲ ماههٔ اخیر است.",
  buyer_power_strong: "قدرت خریدار حقیقی (نسبت سرانهٔ خرید به فروش) بالای ۲ است.",
  money_inflow_3d: "۳ روز متوالی ورود پول حقیقی مثبت بوده است.",
  near_52w_high: "قیمت نزدیک بیشینهٔ ۵۲ هفتهٔ اخیر است.",
  near_52w_low: "قیمت نزدیک کمینهٔ ۵۲ هفتهٔ اخیر است.",
  composite_rank_strong: "رتبهٔ فنی مرکب (شبیه SCTR) بالای پرسنتایل ۸۰ است.",
};

/** همان جملهٔ توضیحی یک قانون — برای SignalReasonBreakdown (چه trigger شده باشد چه نه). */
export function ruleLabel(rule: string): string {
  return RULE_TEMPLATES[rule] ?? `قانون «${rule}»`;
}
