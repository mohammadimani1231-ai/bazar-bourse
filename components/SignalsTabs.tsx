"use client";

import { useState } from "react";
import { SignalsTable, type SignalRow } from "@/components/SignalsTable";
import { RulePerformance, type ScorePoint } from "@/components/RulePerformance";
import type { RuleStat } from "@/lib/ruleStats.ts";

export function SignalsTabs({
  initialSignals,
  ruleStats,
  scorePoints,
  onSelectSymbol,
}: {
  initialSignals: SignalRow[];
  ruleStats: RuleStat[];
  scorePoints: ScorePoint[];
  onSelectSymbol?: (symbol: string) => void;
}) {
  const [tab, setTab] = useState<"active" | "track_record">("active");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-fit gap-1 rounded-lg border border-border bg-surface p-1 text-sm shadow-card">
        <button
          onClick={() => setTab("active")}
          className={`rounded-md px-3 py-1.5 ${tab === "active" ? "bg-accent text-white" : "text-muted hover:bg-surface-2"}`}
        >
          سیگنال‌های فعال
        </button>
        <button
          onClick={() => setTab("track_record")}
          className={`rounded-md px-3 py-1.5 ${tab === "track_record" ? "bg-accent text-white" : "text-muted hover:bg-surface-2"}`}
        >
          کارنامه
        </button>
      </div>
      {tab === "active" ? (
        <SignalsTable initial={initialSignals} onSelectSymbol={onSelectSymbol} />
      ) : (
        <RulePerformance stats={ruleStats} scorePoints={scorePoints} />
      )}
    </div>
  );
}
