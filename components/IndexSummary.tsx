import { formatFaCompactRial, formatFaNumber, formatFaPercent } from "@/lib/format.ts";
import { AsOfBadge } from "@/components/AsOfBadge";
import { Sparkline } from "@/components/Sparkline";

function IndexCard({
  label,
  value,
  changePct,
  capturedAt,
  marketOpen,
  history,
}: {
  label: string;
  value: number | null;
  changePct: number | null;
  capturedAt: string | null;
  marketOpen: boolean;
  /** بستهٔ آخرین ~۲۰ روز معاملاتی (صعودی زمانی) از benchmark_candles — اختیاری، اگر نبود sparkline نشان داده نمی‌شود. */
  history?: (number | null)[];
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-surface shadow-card p-3">
      {history && history.filter((v) => v != null).length >= 2 && (
        // فقط نیمهٔ پایین کارت — طوری‌که خط روی عدد اصلی رد نشود، همان الگوی کارت‌های
        // «Trading P&L» که در بازبینی مراجع دیده شد (عدد بالا، روند به‌عنوان کف کارت).
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-80">
          <Sparkline values={history} width={400} height={40} glow responsive />
        </div>
      )}
      <div className="relative">
        <p className="text-xs text-muted">{label}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <p className="ltr-nums text-right text-3xl font-bold tracking-tight">{formatFaNumber(value)}</p>
          <span
            className={`ltr-nums rounded-full px-2 py-0.5 text-xs font-bold ${
              changePct == null ? "bg-surface-2 text-muted" : changePct >= 0 ? "bg-up/20 text-up-text" : "bg-down/20 text-down-text"
            }`}
          >
            {formatFaPercent(changePct)}
          </span>
        </div>
        <div className="mt-1.5">
          <AsOfBadge capturedAt={capturedAt} marketOpen={marketOpen} />
        </div>
      </div>
    </div>
  );
}

export function IndexSummary({
  tedpix,
  tedpixChangePct,
  tedpixDate,
  tedpixHistory,
  tedpixEqualWeight,
  tedpixEqualWeightChangePct,
  tedpixEqualWeightDate,
  tedpixEqualWeightHistory,
  totalMarketValue,
  totalMarketValueCapturedAt,
  marketOpen,
}: {
  tedpix: number | null;
  tedpixChangePct: number | null;
  tedpixDate: string | null;
  /** بستهٔ آخرین ~۲۰ روز معاملاتی از benchmark_candles، برای sparkline پس‌زمینه — اختیاری. */
  tedpixHistory?: (number | null)[];
  tedpixEqualWeight: number | null;
  tedpixEqualWeightChangePct: number | null;
  tedpixEqualWeightDate: string | null;
  tedpixEqualWeightHistory?: (number | null)[];
  totalMarketValue: number | null;
  totalMarketValueCapturedAt: string | null;
  marketOpen: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <IndexCard
        label="شاخص کل"
        value={tedpix}
        changePct={tedpixChangePct}
        capturedAt={tedpixDate}
        marketOpen={marketOpen}
        history={tedpixHistory}
      />
      <IndexCard
        label="شاخص هم‌وزن"
        value={tedpixEqualWeight}
        changePct={tedpixEqualWeightChangePct}
        capturedAt={tedpixEqualWeightDate}
        marketOpen={marketOpen}
        history={tedpixEqualWeightHistory}
      />
      <div className="rounded-lg border border-border bg-surface shadow-card p-3">
        {/* از market_index_quotes (tval زندهٔ BrsApi) — واقعاً کل بازار است، نه فقط واچ‌لیست. */}
        <p className="text-xs text-muted">ارزش معاملات بازار (امروز)</p>
        <p className="ltr-nums mt-1 text-right text-3xl font-bold tracking-tight">{formatFaCompactRial(totalMarketValue)}</p>
        <div className="mt-1.5">
          <AsOfBadge capturedAt={totalMarketValueCapturedAt} marketOpen={marketOpen} />
        </div>
      </div>
    </div>
  );
}
