export type ComparisonOp = ">" | "<" | ">=" | "<=" | "==" | "!=";

export type RuleDefinition =
  | { type: "cross"; fast: string; slow: string; direction: "up" | "down" }
  | { type: "threshold"; metric: string; op: ComparisonOp; value: number }
  | { type: "streak"; metric: string; op: ComparisonOp; value: number; days: number };

export interface SignalRule {
  name: string;
  definition: RuleDefinition;
  weight: number;
  enabled: boolean;
}

export interface SignalContext {
  /** سری‌های نام‌گذاری‌شده (مثل EMA9/EMA26) — مقدار امروز و دیروز، برای تشخیص کراس. */
  series: Record<string, { current: number | null; previous: number | null }>;
  /** متریک‌های عددی/بولی لحظه‌ای (buyer_power، composite_rank، pct_from_52w_high، ...). */
  metrics: Record<string, number | boolean | null>;
  /** تاریخچهٔ کوتاه یک متریک به ترتیب قدیم→جدید (برای قوانین streak مثل «۳ روز متوالی»). */
  history: Record<string, (number | null)[]>;
  /** نماد الان در صف خرید قفل‌شده (bid1_price == price_max). */
  queueLocked: boolean;
  /** نماد الان در صف فروش قفل‌شده (ask1_price == price_min) — فشار فروش شدید/limit-down.
   * خرید در این وضعیت هم باید suppress شود، دقیقاً مثل قفل صف خرید. */
  queueLockedSell: boolean;
}

export interface RuleEvaluation {
  rule: string;
  triggered: boolean;
  contribution: number;
  detail?: Record<string, unknown>;
}

export interface SignalEvaluation {
  score: number;
  direction: "buy" | "sell" | "none";
  reasons: RuleEvaluation[];
  suppressed: boolean;
}

/** آستانه‌های صدور سیگنال — export شده تا UI (مثل SignalReasonBreakdown) بتواند «امتیاز از
 * چند» را نشان دهد، بدون اینکه رفتار evaluateSignal پایین تغییر کند. */
export const BUY_THRESHOLD_NORMAL = 40;
export const BUY_THRESHOLD_ABNORMAL = 60;
export const SELL_THRESHOLD = -40;

function compare(value: number, op: ComparisonOp, target: number): boolean {
  switch (op) {
    case ">":
      return value > target;
    case "<":
      return value < target;
    case ">=":
      return value >= target;
    case "<=":
      return value <= target;
    case "==":
      return value === target;
    case "!=":
      return value !== target;
  }
}

function evaluateRule(
  def: RuleDefinition,
  ctx: SignalContext,
): { triggered: boolean; detail?: Record<string, unknown> } {
  switch (def.type) {
    case "cross": {
      const fast = ctx.series[def.fast];
      const slow = ctx.series[def.slow];
      if (
        !fast ||
        !slow ||
        fast.current == null ||
        fast.previous == null ||
        slow.current == null ||
        slow.previous == null
      ) {
        return { triggered: false };
      }
      const detail = { fast: fast.current, slow: slow.current };
      if (def.direction === "up") {
        return { triggered: fast.previous <= slow.previous && fast.current > slow.current, detail };
      }
      return { triggered: fast.previous >= slow.previous && fast.current < slow.current, detail };
    }
    case "threshold": {
      const raw = ctx.metrics[def.metric];
      if (raw == null) return { triggered: false };
      const value = typeof raw === "boolean" ? (raw ? 1 : 0) : raw;
      return { triggered: compare(value, def.op, def.value), detail: { value } };
    }
    case "streak": {
      const hist = ctx.history[def.metric];
      if (!hist || hist.length < def.days) return { triggered: false };
      const recent = hist.slice(-def.days);
      const triggered = recent.every((v) => v != null && compare(v, def.op, def.value));
      return { triggered, detail: { recent } };
    }
  }
}

/**
 * جمع وزن‌دار قوانین فعال → score در بازهٔ [-100, +100]. آستانهٔ خرید در رژیم عادی +۴۰،
 * در رژیم غیرعادی +۶۰ (قید CLAUDE.md: گیت رژیم بازار)؛ آستانهٔ فروش همیشه −۴۰.
 * گیت صف: اگر نماد در صف خرید قفل‌شده باشد (نمی‌شود خرید)، یا در صف فروش قفل‌شده باشد
 * (فشار فروش شدید/limit-down)، خرید suppress می‌شود.
 */
export function evaluateSignal(
  rules: SignalRule[],
  ctx: SignalContext,
  marketRegimeNormal = true,
): SignalEvaluation {
  const reasons: RuleEvaluation[] = [];
  let rawScore = 0;

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const { triggered, detail } = evaluateRule(rule.definition, ctx);
    const contribution = triggered ? rule.weight : 0;
    rawScore += contribution;
    reasons.push({ rule: rule.name, triggered, contribution, detail });
  }

  const score = Math.max(-100, Math.min(100, rawScore));
  const buyThreshold = marketRegimeNormal ? BUY_THRESHOLD_NORMAL : BUY_THRESHOLD_ABNORMAL;
  const sellThreshold = SELL_THRESHOLD;

  let direction: "buy" | "sell" | "none" = "none";
  if (score >= buyThreshold) direction = "buy";
  else if (score <= sellThreshold) direction = "sell";

  const suppressed = direction === "buy" && (ctx.queueLocked || ctx.queueLockedSell);

  return { score, direction: suppressed ? "none" : direction, reasons, suppressed };
}
