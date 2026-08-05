import { formatFaCompactRial, formatFaNumber, formatFaPercent } from "@/lib/format.ts";

function IndexCard({
  label,
  value,
  changePct,
}: {
  label: string;
  value: number | null;
  changePct: number | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="ltr-nums text-2xl font-bold">{formatFaNumber(value)}</p>
        <p
          className={`ltr-nums text-sm font-bold ${
            changePct == null ? "text-muted" : changePct >= 0 ? "text-up" : "text-down"
          }`}
        >
          {formatFaPercent(changePct)}
        </p>
      </div>
    </div>
  );
}

export function IndexSummary({
  tedpix,
  tedpixChangePct,
  tedpixEqualWeight,
  tedpixEqualWeightChangePct,
  totalMarketValue,
}: {
  tedpix: number | null;
  tedpixChangePct: number | null;
  tedpixEqualWeight: number | null;
  tedpixEqualWeightChangePct: number | null;
  totalMarketValue: number | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <IndexCard label="شاخص کل" value={tedpix} changePct={tedpixChangePct} />
      <IndexCard label="شاخص هم‌وزن" value={tedpixEqualWeight} changePct={tedpixEqualWeightChangePct} />
      <div className="rounded-lg border border-border bg-surface p-3">
        <p className="text-xs text-muted">ارزش معاملات بازار (امروز)</p>
        <p className="ltr-nums text-2xl font-bold">{formatFaCompactRial(totalMarketValue)}</p>
      </div>
    </div>
  );
}
