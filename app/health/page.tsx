import { HeartPulse } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/serverClient.ts";
import { formatFaNumber } from "@/lib/format.ts";
import { formatJalaliDateTime } from "@/lib/jalali.ts";
import { EmptyState } from "@/components/EmptyState";

// دیتای زنده (قیمت/پول/سیگنال) — نباید در build-time prerender و freeze شود
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  ok: "سالم",
  error: "خطا",
  timeout: "timeout",
  market_closed: "بازار بسته",
};

function statusClass(status: string): string {
  if (status === "ok") return "bg-up/20 text-up";
  if (status === "market_closed") return "bg-surface-2 text-muted";
  return "bg-down/20 text-down";
}

export default async function HealthPage() {
  const supabase = createServerSupabaseClient();
  const dayAgoIso = new Date(new Date().getTime() - 24 * 60 * 60_000).toISOString();

  const [{ data: recentRaw }, { data: errorsRaw }, { data: dbSizeRaw }] = await Promise.all([
    supabase.from("pipeline_health").select("source, status, detail, latency_ms, checked_at").order("checked_at", { ascending: false }).limit(500),
    supabase
      .from("pipeline_health")
      .select("source, status, detail, checked_at")
      .eq("status", "error")
      .gte("checked_at", dayAgoIso)
      .order("checked_at", { ascending: false })
      .limit(100),
    supabase.rpc("db_size_bytes"),
  ]);

  const latestBySource = new Map<string, { status: string; detail: string | null; latency_ms: number | null; checked_at: string }>();
  for (const row of recentRaw ?? []) {
    if (!latestBySource.has(row.source)) {
      latestBySource.set(row.source, row);
    }
  }
  const sources = [...latestBySource.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const dbSizeBytes = typeof dbSizeRaw === "number" ? dbSizeRaw : null;
  const dbSizeMb = dbSizeBytes != null ? dbSizeBytes / 1_000_000 : null;
  const dbCapMb = 500;
  const dbUsagePct = dbSizeMb != null ? Math.min(100, (dbSizeMb / dbCapMb) * 100) : null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold">سلامت پایپ‌لاین</h1>

      <div className="rounded-lg border border-border bg-surface shadow-card p-3">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-bold">حجم دیتابیس</span>
          <span className="ltr-nums text-muted">
            {dbSizeMb == null ? "—" : `${formatFaNumber(dbSizeMb, 1)} MB از ${dbCapMb} MB`}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-surface-2">
          <div
            className={`h-full ${dbUsagePct != null && dbUsagePct > 80 ? "bg-down" : "bg-accent"}`}
            style={{ width: `${dbUsagePct ?? 0}%` }}
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface shadow-card p-3">
        <h2 className="mb-2 text-sm font-bold">آخرین اجرای هر collector</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="p-2 text-right">source</th>
              <th className="p-2 text-right">وضعیت</th>
              <th className="p-2 text-right">latency</th>
              <th className="p-2 text-right">جزئیات</th>
              <th className="p-2 text-right">آخرین اجرا</th>
            </tr>
          </thead>
          <tbody>
            {sources.map(([source, row]) => (
              <tr key={source} className="border-b border-border/60">
                <td className="p-2 font-mono">{source}</td>
                <td className="p-2">
                  <span className={`rounded px-2 py-0.5 font-bold ${statusClass(row.status)}`}>
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
                </td>
                <td className="ltr-nums p-2 text-right text-muted">{row.latency_ms == null ? "—" : `${formatFaNumber(row.latency_ms)}ms`}</td>
                <td className="max-w-xs truncate p-2 text-muted" title={row.detail ?? ""}>
                  {row.detail ?? "—"}
                </td>
                <td className="ltr-nums p-2 text-right text-muted">{formatJalaliDateTime(row.checked_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {sources.length === 0 && <EmptyState icon={HeartPulse} title="هنوز داده‌ای در pipeline_health نیست" />}
      </div>

      <div className="rounded-lg border border-border bg-surface shadow-card p-3">
        <h2 className="mb-2 text-sm font-bold">خطاهای ۲۴ ساعت اخیر</h2>
        {(errorsRaw ?? []).length === 0 ? (
          <p className="text-xs text-muted">در ۲۴ ساعت اخیر خطایی ثبت نشده.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-xs">
            {(errorsRaw ?? []).map((e, i) => (
              <li key={i} className="border-b border-border/60 pb-2 last:border-0">
                <span className="font-mono text-down">{e.source}</span>{" "}
                <span className="ltr-nums text-muted">{formatJalaliDateTime(e.checked_at)}</span>
                <p className="mt-0.5 text-muted">{e.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
