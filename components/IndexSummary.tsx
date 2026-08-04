import { formatFaCompactRial, formatFaNumber, formatFaPercent } from "@/lib/format.ts";

export function IndexSummary({
  tedpix,
  tedpixChangePct,
  totalMarketValue,
}: {
  tedpix: number | null;
  tedpixChangePct: number | null;
  totalMarketValue: number | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-lg border border-border bg-surface p-3">
        <p className="text-xs text-muted">شاخص کل</p>
        <p className="ltr-nums text-lg font-bold">{formatFaNumber(tedpix)}</p>
        <p
          className={`ltr-nums text-xs ${
            tedpixChangePct == null ? "text-muted" : tedpixChangePct >= 0 ? "text-up" : "text-down"
          }`}
        >
          {formatFaPercent(tedpixChangePct)}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-surface p-3">
        <p className="text-xs text-muted">شاخص هم‌وزن</p>
        <p className="text-lg font-bold text-muted">—</p>
        <p className="text-xs text-muted/60">داده‌اش در سیستم موجود نیست</p>
      </div>
      <div className="rounded-lg border border-border bg-surface p-3">
        <p className="text-xs text-muted">ارزش معاملات بازار (امروز)</p>
        <p className="ltr-nums text-lg font-bold">{formatFaCompactRial(totalMarketValue)}</p>
      </div>
    </div>
  );
}
