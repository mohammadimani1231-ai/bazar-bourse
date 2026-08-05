import { formatJalaliDay, formatTehranTime } from "@/lib/jalali.ts";
import { STALE_THRESHOLD_MS, isStaleAsOf } from "@/lib/market-status.ts";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * برچسب «به‌روزرسانی: ...» برای هر ویجت عددی — طبق قاعدهٔ CLAUDE.md: نمایش بدون این برچسب ممنوع.
 * `marketOpen` باید از `lib/market-status.ts::isMarketOpen` بیاید (منبع واحد وضعیت بازار،
 * قید #۱۱) — این کامپوننت خودش هیچ فرضی دربارهٔ روز/ساعت بازار نمی‌سازد.
 * ورودی می‌تواند یک تاریخ خام (`YYYY-MM-DD`، مثل benchmark_candles) یا timestamp کامل باشد؛
 * تاریخ خام همیشه به‌عنوان قدیمی (نه لحظه‌ای) نمایش داده می‌شود — چون واقعاً چنین است.
 */
export function AsOfBadge({
  capturedAt,
  marketOpen,
  staleAfterMs = STALE_THRESHOLD_MS,
}: {
  capturedAt: string | null;
  marketOpen: boolean;
  staleAfterMs?: number;
}) {
  if (!capturedAt) {
    return <span className="text-[10px] text-muted">به‌روزرسانی: نامشخص</span>;
  }

  const isDateOnly = DATE_ONLY_RE.test(capturedAt);
  const stale = isStaleAsOf(capturedAt, marketOpen, new Date().getTime(), staleAfterMs);
  const label = isDateOnly ? formatJalaliDay(capturedAt) : formatTehranTime(capturedAt);

  return (
    <span className={`ltr-nums text-[10px] ${stale ? "text-warning" : "text-muted"}`}>
      {stale && "⚠ "}به‌روزرسانی: {label}
    </span>
  );
}
