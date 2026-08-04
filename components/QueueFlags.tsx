export interface FlagValue {
  value: boolean | null;
}

export interface QueueFlagsData {
  lockedBuy: boolean | null;
  heavy: boolean | null;
  queueVelocity: number | null;
  suspiciousVolume: boolean | null;
  whale: boolean | null;
  codeToCode: boolean | null;
}

function Badge({ label, active, unknown }: { label: string; active: boolean; unknown?: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs ${
        unknown
          ? "bg-surface-2 text-muted"
          : active
            ? "bg-accent/20 text-accent border border-accent/40"
            : "bg-surface-2 text-muted/60"
      }`}
    >
      {label}
    </span>
  );
}

export function QueueFlags({ data }: { data: QueueFlagsData }) {
  const velocityLabel =
    data.queueVelocity == null
      ? null
      : data.queueVelocity > 0
        ? "صف در حال جمع شدن"
        : data.queueVelocity < 0
          ? "صف در حال باز شدن"
          : "صف بدون تغییر";

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <h2 className="mb-2 text-sm font-bold">وضعیت صف و پرچم‌های امروز</h2>
      <div className="flex flex-wrap gap-2">
        <Badge label="قفل خرید" active={!!data.lockedBuy} unknown={data.lockedBuy == null} />
        <Badge label="صف سنگین" active={!!data.heavy} unknown={data.heavy == null} />
        <Badge label={velocityLabel ?? "سرعت صف نامشخص"} active={data.queueVelocity != null} unknown={velocityLabel == null} />
        <Badge label="حجم مشکوک" active={!!data.suspiciousVolume} unknown={data.suspiciousVolume == null} />
        <Badge label="پول درشت" active={!!data.whale} unknown={data.whale == null} />
        <Badge label="کد به کد" active={!!data.codeToCode} unknown={data.codeToCode == null} />
      </div>
    </div>
  );
}
