import { formatJalaliDateTime } from "@/lib/jalali.ts";

export interface SignalHistoryItem {
  id: number;
  direction: string;
  createdAt: string;
  reasons: unknown;
}

interface RuleEvaluationLike {
  rule?: unknown;
  triggered?: unknown;
}

/** فقط قوانینی که واقعاً trigger شده‌اند (reasons شامل همهٔ قوانین فعال است، نه فقط trigger‌شده‌ها) */
function reasonLabels(reasons: unknown): string[] {
  if (!Array.isArray(reasons)) return [];
  return reasons
    .filter((r): r is RuleEvaluationLike => !!r && typeof r === "object" && (r as RuleEvaluationLike).triggered === true)
    .map((r) => String(r.rule))
    .filter((name) => name !== "undefined");
}

export function SignalHistoryList({ items }: { items: SignalHistoryItem[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <h2 className="mb-2 text-sm font-bold">تاریخچهٔ سیگنال‌ها</h2>
      {items.length === 0 && <p className="text-xs text-muted">هنوز سیگنالی برای این نماد ثبت نشده.</p>}
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-2 text-xs last:border-0">
            <span
              className={`rounded px-2 py-0.5 font-bold ${
                item.direction === "buy" ? "bg-up/20 text-up" : item.direction === "sell" ? "bg-down/20 text-down" : "bg-surface-2 text-muted"
              }`}
            >
              {item.direction === "buy" ? "خرید" : item.direction === "sell" ? "فروش" : item.direction}
            </span>
            <span className="ltr-nums text-muted">{formatJalaliDateTime(item.createdAt)}</span>
            <div className="flex flex-wrap gap-1">
              {reasonLabels(item.reasons).map((r) => (
                <span key={r} className="rounded bg-surface-2 px-1.5 py-0.5 text-muted">
                  {r}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
