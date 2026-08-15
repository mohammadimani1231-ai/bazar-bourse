import { formatFaNumber } from "@/lib/format.ts";
import { ruleLabel, type RuleEvaluationLike } from "@/lib/signalExplain.ts";
import { BUY_THRESHOLD_NORMAL, BUY_THRESHOLD_ABNORMAL, SELL_THRESHOLD } from "@/lib/signal-engine.ts";

export interface SignalReasonBreakdownProps {
  score: number;
  direction: string;
  /** خام از ستون signals.regime — هر مقدار غیر از "normal" یعنی رژیم غیرعادی (آستانهٔ خرید ۶۰). */
  regime: string;
  reasons: RuleEvaluationLike[];
}

function thresholdFor(direction: string, regime: string): number {
  if (direction === "sell") return SELL_THRESHOLD;
  return regime === "normal" ? BUY_THRESHOLD_NORMAL : BUY_THRESHOLD_ABNORMAL;
}

/** اگر detail یک عدد value ساده داشت (قوانین threshold) نشانش بده — برای cross/streak که شکل
 * detail پیچیده‌تر است (fast/slow، آرایهٔ recent) عمداً چیزی نشان نمی‌دهیم، نه یک فرمت حدسی. */
function rawValueLabel(detail: Record<string, unknown> | null | undefined): string | null {
  if (!detail || typeof detail.value !== "number") return null;
  return formatFaNumber(detail.value, 1);
}

/**
 * تفکیک کامل عددی یک سیگنال — طبق قید #۶ CLAUDE.md («جعبه‌سیاه ممنوع»). قوانین trigger‌شده
 * اول با سهم امتیازشان، بعد trigger‌نشده‌ها (خاکستری‌تر، برای اینکه معلوم شود بقیهٔ قوانین هم
 * چک شده‌اند، نه نادیده گرفته شده)، بعد مجموع در برابر آستانهٔ واقعی همان سیگنال.
 */
export function SignalReasonBreakdown({ score, direction, regime, reasons }: SignalReasonBreakdownProps) {
  const triggered = reasons.filter((r) => r.triggered);
  const untriggered = reasons.filter((r) => !r.triggered);
  const threshold = thresholdFor(direction, regime);
  // برای فروش (منفی) نسبت پیشرفت را روی قدرمطلق حساب می‌کنیم تا نوار همیشه از ۰ تا ۱۰۰٪ باشد.
  const progressPct = threshold !== 0 ? Math.min(100, Math.max(0, (Math.abs(score) / Math.abs(threshold)) * 100)) : 0;

  return (
    <div className="flex flex-col gap-1.5 text-[11px]">
      <ul className="flex flex-col gap-1">
        {triggered.map((r) => (
          <li key={r.rule} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-foreground">
              <span className={r.contribution && r.contribution < 0 ? "text-down-text" : "text-up-text"}>✓</span>
              {ruleLabel(r.rule)}
            </span>
            <span className={`ltr-nums shrink-0 font-bold ${r.contribution && r.contribution < 0 ? "text-down-text" : "text-up-text"}`}>
              {r.contribution != null && r.contribution >= 0 ? "+" : ""}
              {formatFaNumber(r.contribution ?? 0, 0)}
            </span>
          </li>
        ))}
        {untriggered.map((r) => {
          const rawValue = rawValueLabel(r.detail);
          return (
            <li key={r.rule} className="flex items-center justify-between gap-2 text-muted">
              <span className="flex items-center gap-1">
                <span>✗</span>
                {ruleLabel(r.rule)}
                {rawValue && <span className="ltr-nums">(مقدار: {rawValue})</span>}
              </span>
              <span className="ltr-nums shrink-0">۰</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-1 flex items-center gap-2 border-t border-border pt-1.5">
        <span className="shrink-0 text-muted">
          مجموع: <span className="ltr-nums font-bold text-foreground">{formatFaNumber(score, 0)}</span> از آستانهٔ{" "}
          <span className="ltr-nums font-bold text-foreground">{formatFaNumber(threshold, 0)}</span>
          {direction !== "sell" && regime !== "normal" && " (رژیم غیرعادی)"}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full ${direction === "sell" ? "bg-down" : "bg-up"}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
