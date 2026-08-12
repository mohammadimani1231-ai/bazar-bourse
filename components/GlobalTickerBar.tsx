import { formatFaNumber, formatFaPercent } from "@/lib/format.ts";
import { formatTehranTime } from "@/lib/jalali.ts";

export interface TickerItem {
  asset: string;
  label: string;
  price: number | null;
  changePct: number | null;
  capturedAt: string | null;
}

export function GlobalTickerBar({ items }: { items: TickerItem[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
      <div className="flex min-w-max divide-x divide-x-reverse divide-border">
        {items.map((item) => (
          <div key={item.asset} className="flex flex-col gap-1 px-4 py-3">
            <span className="text-xs text-muted">{item.label}</span>
            <span className="ltr-nums text-right text-sm font-bold">{formatFaNumber(item.price, 0)}</span>
            <span
              className={`ltr-nums text-right text-xs ${
                item.changePct == null
                  ? "text-muted"
                  : item.changePct > 0
                    ? "text-up"
                    : item.changePct < 0
                      ? "text-down"
                      : "text-muted"
              }`}
            >
              {formatFaPercent(item.changePct)}
            </span>
            {item.capturedAt && (
              <span className="ltr-nums text-right text-[10px] text-muted/70">
                {formatTehranTime(item.capturedAt)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
