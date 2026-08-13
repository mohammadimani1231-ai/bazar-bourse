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
    <div className="rounded-lg border border-border bg-surface shadow-card p-3">
      <h2 className="mb-3 text-sm font-bold">رتبه‌بندی صنایع — ورود پول حقیقی امروز</h2>
      {sorted.length === 0 ? (
        <EmptyState icon={PieChart} title="هنوز داده‌ای ثبت نشده" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {sorted.map((item) => {
            const widthPct = (Math.abs(item.moneyFlow) / maxAbs) * 100;
            const positive = item.moneyFlow >= 0;
            return (
              <div key={item.industry}>
                {/* برچسب صنعت روی ردیف مستقل خودش (نه ستون هم‌عرض کنار نوار) — نام‌های بلند
                    مثل «خودرو و ساخت قطعات» با truncate در یک ستون باریک بریده و ناخوانا
                    می‌شدند؛ الگوی sectorFlows در design_handoff_dashboard_redesign همین را
                    با دو ردیف حل کرده. */}
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-muted">{item.industry}</span>
                  <span className={`ltr-nums shrink-0 font-bold ${positive ? "text-up" : "text-down"}`}>
                    {formatFaCompactRial(item.moneyFlow)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className={`h-full rounded-full ${positive ? "bg-up" : "bg-down"}`} style={{ width: `${widthPct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
