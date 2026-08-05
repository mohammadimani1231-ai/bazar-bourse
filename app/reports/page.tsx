import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/serverClient.ts";
import { formatJalaliDateTime } from "@/lib/jalali.ts";
import { PrintReportButton } from "@/components/PrintReportButton";

// آرشیو گزارش‌ها — نباید در build-time prerender و freeze شود
export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  weekly: "گزارش هفتگی بازار",
  symbol: "گزارش عمیق نماد",
};

interface ReportsPageProps {
  searchParams: Promise<{ id?: string; type?: string; symbol?: string }>;
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const { id, type, symbol } = await searchParams;
  const supabase = createServerSupabaseClient();

  if (id) {
    const { data: report } = await supabase.from("reports").select("id, type, period, html, created_at").eq("id", id).maybeSingle();
    if (!report) {
      return (
        <div className="flex flex-col gap-4">
          <Link href="/reports" className="text-xs text-muted hover:underline">
            ← بازگشت به آرشیو
          </Link>
          <p className="text-sm text-muted">گزارش پیدا نشد.</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between print:hidden">
          <Link href="/reports" className="text-xs text-muted hover:underline">
            ← بازگشت به آرشیو
          </Link>
          <PrintReportButton />
        </div>
        {/* گزارش، HTML ثابتِ سمت‌سرور از جدول reports است — هیچ ورودی کاربر در این رشته نیست، همه‌چیز داخل خودِ generator (weekly-report / generateSymbolReport) escape شده */}
        <div dangerouslySetInnerHTML={{ __html: report.html }} />
      </div>
    );
  }

  let query = supabase.from("reports").select("id, type, period, created_at").order("created_at", { ascending: false }).limit(100);
  if (type === "weekly" || type === "symbol") {
    query = query.eq("type", type);
  }
  if (symbol) {
    query = query.ilike("period", `%${symbol}%`);
  }
  const { data: reports } = await query;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold">آرشیو گزارش‌ها</h1>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          نوع
          <select name="type" defaultValue={type ?? ""} className="rounded border border-border bg-surface-2 px-2 py-1 text-sm text-fg">
            <option value="">همه</option>
            <option value="weekly">هفتگی</option>
            <option value="symbol">تک‌نماد</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          جستجوی نماد
          <input
            type="text"
            name="symbol"
            defaultValue={symbol ?? ""}
            placeholder="مثلا فولاد"
            className="rounded border border-border bg-surface-2 px-2 py-1 text-sm text-fg"
          />
        </label>
        <button type="submit" className="rounded border border-border px-3 py-1.5 text-xs font-bold text-fg hover:bg-surface-2">
          اعمال فیلتر
        </button>
        {(type || symbol) && (
          <Link href="/reports" className="text-xs text-muted hover:underline">
            حذف فیلتر
          </Link>
        )}
      </form>

      {(reports ?? []).length === 0 ? (
        <p className="text-sm text-muted">گزارشی مطابق این فیلتر پیدا نشد.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {(reports ?? []).map((r) => (
            <Link
              key={r.id}
              href={`/reports?id=${r.id}`}
              className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 hover:bg-surface-2"
            >
              <div className="flex flex-col gap-1">
                <p className="text-sm font-bold">{TYPE_LABELS[r.type] ?? r.type}</p>
                <p className="text-xs text-muted">{r.period}</p>
              </div>
              <p className="ltr-nums text-xs text-muted">{formatJalaliDateTime(r.created_at)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
