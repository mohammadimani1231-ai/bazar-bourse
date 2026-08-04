import type { DailyBrief } from "@/lib/briefSchema.ts";
import { BriefConfidenceBadge } from "@/components/BriefConfidenceBadge";
import { RefTooltip } from "@/components/RefTooltip";

const MOOD_STYLES: Record<string, string> = {
  مثبت: "bg-up/20 text-up",
  خنثی: "bg-surface-2 text-muted",
  منفی: "bg-down/20 text-down",
};

export function BriefView({
  brief,
  inputSnapshot,
  compact = false,
}: {
  brief: DailyBrief;
  inputSnapshot: Record<string, unknown>;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${MOOD_STYLES[brief.market_mood] ?? "bg-surface-2"}`}>
          {brief.market_mood}
        </span>
      </div>
      <p className="text-sm leading-6">{brief.summary}</p>

      {!compact && brief.sector_notes.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-bold text-muted">یادداشت صنایع</p>
          <ul className="flex flex-col gap-1.5">
            {brief.sector_notes.map((n, i) => (
              <li key={i} className="text-xs">
                <span className="font-bold">{n.sector}</span> — {n.view} <BriefConfidenceBadge confidence={n.confidence} />{" "}
                <RefTooltip refPath={n.ref} inputSnapshot={inputSnapshot} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {!compact && brief.signal_review.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-bold text-muted">بازبینی سیگنال‌ها</p>
          <ul className="flex flex-col gap-1.5">
            {brief.signal_review.map((s, i) => (
              <li key={i} className="text-xs">
                <span className="font-bold">{s.symbol}</span>{" "}
                <span className={s.verdict === "هم‌راستا" ? "text-up" : "text-down"}>{s.verdict}</span> — {s.note}{" "}
                <RefTooltip refPath={s.ref} inputSnapshot={inputSnapshot} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted">
        <span className="font-bold text-foreground">ریسک اصلی:</span> {brief.main_risk}
      </p>
    </div>
  );
}
