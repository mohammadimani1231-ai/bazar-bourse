import { PieChart } from "lucide-react";
import { formatFaCompactRial } from "@/lib/format.ts";
import { EmptyState } from "@/components/EmptyState";

export interface IndustryFlow {
  industry: string;
  moneyFlow: number;
}

export function IndustryRanking({ items }: { items: IndustryFlow[] }) {
  const sorted = [...items].sort((a, b) => b.moneyFlow - a.moneyFlow);
  const maxAbs = Math.max(1, ...sorted.map((i) => Math.abs(i.moneyFlow)));

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <h2 className="mb-3 text-sm font-bold">رتبه‌بندی صنایع — ورود پول حقیقی امروز</h2>
      {sorted.length === 0 ? (
        <EmptyState icon={PieChart} title="هنوز داده‌ای ثبت نشده" />
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((item) => {
            const widthPct = (Math.abs(item.moneyFlow) / maxAbs) * 100;
            const positive = item.moneyFlow >= 0;
            return (
              <div key={item.industry} className="flex items-center gap-2 text-xs">
                <span className="w-32 shrink-0 truncate text-muted">{item.industry}</span>
                <div className="relative h-4 flex-1 overflow-hidden rounded bg-surface-2">
                  <div className={`h-full ${positive ? "bg-up" : "bg-down"}`} style={{ width: `${widthPct}%` }} />
                </div>
                <span className={`ltr-nums w-24 shrink-0 text-left ${positive ? "text-up" : "text-down"}`}>
                  {formatFaCompactRial(item.moneyFlow)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
