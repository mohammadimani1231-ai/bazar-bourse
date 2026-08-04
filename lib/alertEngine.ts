export type ComparisonOp = ">" | "<" | ">=" | "<=" | "==" | "!=";

export type AlertCondition =
  | { type: "signal"; direction: "buy" | "sell" }
  | { type: "tension_index"; op: ComparisonOp; value: number }
  | { type: "pipeline_health"; status: string }
  | { type: "tabloo_metric"; metric: string };

export interface AlertRule {
  id: number;
  name: string;
  condition: AlertCondition;
  severity: "action" | "info";
  firePolicy: "once" | "once_per_bar_close" | "cooldown";
  cooldownMinutes: number | null;
  enabled: boolean;
}

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

export function tensionConditionMet(condition: { op: ComparisonOp; value: number }, gaugeValue: number | null): boolean {
  if (gaugeValue == null) return false;
  return compare(gaugeValue, condition.op, condition.value);
}

/**
 * دروازهٔ cooldown — فقط برای fire_policy='cooldown' معنا دارد. قوانین 'once' و
 * 'once_per_bar_close' با دیدوپ در سطح رویداد (کوئری DB، نه زمان) کنترل می‌شوند، نه این تابع.
 */
export function isCooldownElapsed(
  rule: Pick<AlertRule, "firePolicy" | "cooldownMinutes">,
  lastFiredAtIso: string | null,
  nowIso: string,
): boolean {
  if (rule.firePolicy !== "cooldown") return true;
  if (!lastFiredAtIso || rule.cooldownMinutes == null) return true;
  const elapsedMinutes = (Date.parse(nowIso) - Date.parse(lastFiredAtIso)) / 60_000;
  return elapsedMinutes >= rule.cooldownMinutes;
}
