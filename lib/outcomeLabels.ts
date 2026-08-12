import { percentile } from "./tabloo.ts";

/**
 * برچسب‌گذاری علت نتیجهٔ هر معاملهٔ مجازی (بخش ۳) — **فقط برچسب عینی و خودکار، بدون هیچ
 * قضاوت LLM** (قید #۷: مدل زبانی هرگز در مسیر صدور/ارزیابی سیگنال نیست).
 *
 * آستانه‌ها پرسنتایلی‌اند نه عدد ثابت دلخواه (قید #۴): «جهش گِیج تنش» یعنی تغییر روزانهٔ
 * گِیج بالاتر از پرسنتایل مشخصی از **توزیع تاریخی خودِ همان گِیج**، نه یک عدد حفظی مثل ۱۵.
 *
 * جریان یک‌طرفه (قید #۱۴): این برچسب‌ها فقط توصیف می‌کنند؛ هیچ‌کدام به‌صورت خودکار وزن یا
 * آستانه‌ای را تغییر نمی‌دهند.
 */

export type OutcomeLabel =
  /** سیگنال درست بود و بازار هم برگشت — نتیجهٔ مثبت طبق قوانین. */
  | "rule_worked"
  /** سیگنال طبق قوانین صادر شد ولی بازار برنگشت و شوک بیرونی هم نبود → نشانهٔ ضعف edge. */
  | "rule_failed_no_shock"
  /** هم‌زمان با جهش گِیج تنش در دورهٔ نگه‌داری. */
  | "external_shock"
  /** اجرا نشد یا با تأخیر/قیمت بدتر اجرا شد به دلیل صف. */
  | "microstructure_limit";

export const OUTCOME_LABEL_FA: Record<OutcomeLabel, string> = {
  rule_worked: "نتیجهٔ مثبت طبق قوانین",
  rule_failed_no_shock: "طبق قوانین، نتیجه منفی بدون شوک بیرونی",
  external_shock: "شوک بیرونی",
  microstructure_limit: "محدودیت ریزساختار",
};

/**
 * پرسنتایلی که بالاتر از آن، تغییر روزانهٔ گِیج تنش «جهش» شمرده می‌شود. عدد ۹۰ یعنی
 * «۱۰٪ پرتلاطم‌ترین روزهای تاریخ گِیج»، نه یک آستانهٔ مطلق — با تغییر رژیم تورمی/سیاسی
 * خودش را تنظیم می‌کند.
 */
export const TENSION_SPIKE_PERCENTILE = 90;

/** حداقل تعداد نمونهٔ تاریخی گِیج برای اینکه آستانهٔ پرسنتایلی معنا داشته باشد. */
export const MIN_TENSION_SAMPLES = 30;

export interface TensionPoint {
  date: string;
  gaugeValue: number;
}

export interface OutcomeLabelInput {
  /** وضعیت رکورد virtual_trades. */
  status: string;
  /** تعداد روزهای معاملاتی که سفارش در صف منتظر مانده (۰ یعنی بلافاصله اجرا شد). */
  queueWaitDays: number;
  /** سود/زیان خالص؛ null یعنی معامله اصلاً اجرا نشده. */
  pnl: number | null;
  /** بازهٔ نگه‌داری — برای بررسی جهش تنش. null یعنی اجرا نشده. */
  entryDate: string | null;
  exitDate: string | null;
}

export interface OutcomeLabelResult {
  label: OutcomeLabel;
  /** توضیح عینی و کوتاه — همان چیزی که در UI/گزارش کنار برچسب نشان داده می‌شود. */
  reason: string;
  /** آستانهٔ پرسنتایلی استفاده‌شده؛ null یعنی دادهٔ کافی برای محاسبه‌اش نبود. */
  spikeThreshold: number | null;
}

/**
 * آستانهٔ «جهش» را از توزیع تاریخی تغییرات روزانهٔ گِیج می‌سازد.
 * null یعنی نمونهٔ تاریخی کافی نیست — در آن صورت برچسب «شوک بیرونی» اصلاً صادر نمی‌شود
 * (به‌جای اینکه با یک عدد ثابت حدسی جایش را پر کنیم).
 */
export function tensionSpikeThreshold(
  history: TensionPoint[],
  p: number = TENSION_SPIKE_PERCENTILE,
): number | null {
  if (history.length < MIN_TENSION_SAMPLES) return null;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const dailyChanges: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    dailyChanges.push(Math.abs(sorted[i].gaugeValue - sorted[i - 1].gaugeValue));
  }
  if (dailyChanges.length === 0) return null;
  return percentile(dailyChanges, p);
}

/** بیشترین تغییر روزانهٔ گِیج در بازهٔ نگه‌داری. */
export function maxTensionMoveInWindow(
  history: TensionPoint[],
  fromDate: string,
  toDate: string,
): number | null {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  let maxMove: number | null = null;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].date < fromDate || sorted[i].date > toDate) continue;
    const move = Math.abs(sorted[i].gaugeValue - sorted[i - 1].gaugeValue);
    if (maxMove == null || move > maxMove) maxMove = move;
  }
  return maxMove;
}

/**
 * ترتیب بررسی عمدی است: ریزساختار → شوک بیرونی → نتیجه.
 * ریزساختار اول است چون اگر معامله اصلاً اجرا نشده (یا با تأخیر صف اجرا شده)، صحبت از
 * «درست/غلط بودن سیگنال» بی‌معناست — علت واقعی، محدودیت اجراست نه کیفیت سیگنال.
 */
export function labelOutcome(input: OutcomeLabelInput, tensionHistory: TensionPoint[]): OutcomeLabelResult {
  const spikeThreshold = tensionSpikeThreshold(tensionHistory);

  const notExecuted = ["pending_queue", "expired_queue", "rejected_liquidity", "rejected_max_positions", "rejected_stale_data"];
  if (notExecuted.includes(input.status)) {
    return {
      label: "microstructure_limit",
      reason:
        input.status === "expired_queue"
          ? "صف باز نشد و سفارش منقضی شد — سیگنال هرگز اجرا نشد"
          : input.status === "pending_queue"
            ? "سفارش هنوز پشت صف در انتظار است"
            : "سفارش به دلیل محدودیت اجرا (نقدینگی/سقف پوزیشن/دادهٔ کهنه) اجرا نشد",
      spikeThreshold,
    };
  }

  if (input.queueWaitDays > 0) {
    return {
      label: "microstructure_limit",
      reason: `${input.queueWaitDays} روز پشت صف ماند و با قیمت روز بازشدن صف اجرا شد، نه قیمت روز سیگنال`,
      spikeThreshold,
    };
  }

  if (input.entryDate != null && input.exitDate != null && spikeThreshold != null) {
    const maxMove = maxTensionMoveInWindow(tensionHistory, input.entryDate, input.exitDate);
    // مقایسه عمداً اکید (>) است نه >=: اگر توزیع تغییرات گِیج تخت باشد (مثلاً گِیج تقریباً
    // ثابت بماند)، پرسنتایل ۹۰ برابر یک روز کاملاً عادی درمی‌آید و با >= هر معامله‌ای
    // «شوک بیرونی» برچسب می‌خورد. با > در آن حالت هیچ شوکی ادعا نمی‌شود — که رفتار
    // محافظه‌کارانه و درست است: وقتی گِیج حرکت غیرعادی نداشته، نباید تقصیر را گردن شوک انداخت.
    if (maxMove != null && maxMove > spikeThreshold) {
      return {
        label: "external_shock",
        reason: `بیشترین جهش روزانهٔ گِیج تنش در دورهٔ نگه‌داری ${maxMove.toFixed(1)} بود، بالاتر از آستانهٔ پرسنتایل ${TENSION_SPIKE_PERCENTILE} تاریخی (${spikeThreshold.toFixed(1)})`,
        spikeThreshold,
      };
    }
  }

  if (input.pnl != null && input.pnl > 0) {
    return { label: "rule_worked", reason: "سیگنال صادر شد، اجرا شد و نتیجه مثبت بود", spikeThreshold };
  }

  return {
    label: "rule_failed_no_shock",
    reason:
      spikeThreshold == null
        ? "نتیجه منفی بود؛ دادهٔ تاریخی گِیج تنش برای بررسی شوک بیرونی کافی نیست، پس شوک رد یا تأیید نشد"
        : "سیگنال طبق قوانین صادر شد ولی بازار برنگشت و جهش تنشی هم در دورهٔ نگه‌داری نبود — نشانهٔ ضعف edge",
    spikeThreshold,
  };
}

/** توزیع برچسب‌ها برای گزارش هفتگی و صفحهٔ کارنامه. */
export function summarizeLabels(labels: OutcomeLabel[]): Record<OutcomeLabel, number> {
  const counts: Record<OutcomeLabel, number> = {
    rule_worked: 0,
    rule_failed_no_shock: 0,
    external_shock: 0,
    microstructure_limit: 0,
  };
  for (const l of labels) counts[l] += 1;
  return counts;
}
