import { Sparkles } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/serverClient.ts";
import { formatJalaliDateTime } from "@/lib/jalali.ts";
import { BriefView } from "@/components/BriefView";
import { EmptyState } from "@/components/EmptyState";

// دیتای زنده — نباید در build-time prerender و freeze شود
export const dynamic = "force-dynamic";

export default async function BriefsPage() {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("ai_briefs")
    .select("id, brief, input_snapshot, meta, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold text-shell-text">تحلیل‌های قبلی</h1>
      {(data ?? []).length === 0 ? (
        <div className="rounded-lg border border-border bg-surface shadow-card p-3">
          <EmptyState icon={Sparkles} title="هنوز بریفی تولید نشده" />
        </div>
      ) : (
        (data ?? []).map((row) => (
          <div key={row.id} className="rounded-lg border border-border bg-surface shadow-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="ltr-nums text-xs text-muted">{formatJalaliDateTime(row.created_at)}</p>
              {row.meta && (
                <p className="ltr-nums text-[10px] text-muted">
                  {(row.meta as { model?: string }).model} · {(row.meta as { input_tokens?: number }).input_tokens}
                  /{(row.meta as { output_tokens?: number }).output_tokens} توکن
                </p>
              )}
            </div>
            <BriefView brief={row.brief} inputSnapshot={row.input_snapshot} />
          </div>
        ))
      )}
    </div>
  );
}
