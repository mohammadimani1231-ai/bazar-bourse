import Link from "next/link";
import { Sparkles } from "lucide-react";
import { formatJalaliDateTime } from "@/lib/jalali.ts";
import { BriefView } from "@/components/BriefView";
import { EmptyState } from "@/components/EmptyState";
import type { DailyBrief } from "@/lib/briefSchema.ts";

export interface LatestBrief {
  brief: DailyBrief;
  inputSnapshot: Record<string, unknown>;
  createdAt: string;
}

export function AiBriefCard({ latest }: { latest: LatestBrief | null }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold">بریف روزانهٔ هوش مصنوعی</h2>
        <Link href="/briefs" className="text-xs text-accent hover:underline">
          تحلیل‌های قبلی
        </Link>
      </div>
      {latest ? (
        <>
          <BriefView brief={latest.brief} inputSnapshot={latest.inputSnapshot} compact />
          <p className="ltr-nums mt-2 text-[11px] text-muted">{formatJalaliDateTime(latest.createdAt)}</p>
        </>
      ) : (
        <EmptyState icon={Sparkles} title="هنوز بریفی تولید نشده" description="اولین اجرا ساعت ۸:۳۰ صبح (قبل بازگشایی بازار) است." />
      )}
    </div>
  );
}
