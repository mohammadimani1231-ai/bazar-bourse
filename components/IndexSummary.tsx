import { formatFaCompactRial, formatFaNumber, formatFaPercent } from "@/lib/format.ts";
import { AsOfBadge } from "@/components/AsOfBadge";

function IndexCard({
  label,
  value,
  changePct,
  capturedAt,
  marketOpen,
}: {
  label: string;
  value: number | null;
  changePct: number | null;
  capturedAt: string | null;
  marketOpen: boolean;
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
      <div className="mt-1">
        <AsOfBadge capturedAt={capturedAt} marketOpen={marketOpen} />
      </div>
    </div>
  );
}

export function IndexSummary({
  tedpix,
  tedpixChangePct,
  tedpixDate,
  tedpixEqualWeight,
  tedpixEqualWeightChangePct,
  tedpixEqualWeightDate,
  totalMarketValue,
  totalMarketValueCapturedAt,
  marketOpen,
}: {
  tedpix: number | null;
  tedpixChangePct: number | null;
  tedpixDate: string | null;
  tedpixEqualWeight: number | null;
  tedpixEqualWeightChangePct: number | null;
  tedpixEqualWeightDate: string | null;
  totalMarketValue: number | null;
  totalMarketValueCapturedAt: string | null;
  marketOpen: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <IndexCard label="شاخص کل" value={tedpix} changePct={tedpixChangePct} capturedAt={tedpixDate} marketOpen={marketOpen} />
      <IndexCard
        label="شاخص هم‌وزن"
        value={tedpixEqualWeight}
        changePct={tedpixEqualWeightChangePct}
        capturedAt={tedpixEqualWeightDate}
        marketOpen={marketOpen}
      />
      <div className="rounded-lg border border-border bg-surface p-3">
        {/* از market_index_quotes (tval زندهٔ BrsApi) — واقعاً کل بازار است، نه فقط واچ‌لیست. */}
        <p className="text-xs text-muted">ارزش معاملات بازار (امروز)</p>
        <p className="ltr-nums text-2xl font-bold">{formatFaCompactRial(totalMarketValue)}</p>
        <div className="mt-1">
          <AsOfBadge capturedAt={totalMarketValueCapturedAt} marketOpen={marketOpen} />
        </div>
      </div>
    </div>
  );
}
