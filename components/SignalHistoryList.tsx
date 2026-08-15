"use client";

import { useState } from "react";
import { formatJalaliDateTime } from "@/lib/jalali.ts";
import { SignalReasonBreakdown } from "@/components/SignalReasonBreakdown";
import type { RuleEvaluationLike } from "@/lib/signalExplain.ts";

export interface SignalHistoryItem {
  id: number;
  direction: string;
  score: number;
  regime: string;
  createdAt: string;
  reasons: RuleEvaluationLike[];
}

/** بدون کارت/تیتر خودش — والد (`SymbolTabs`) کارت و تیتر تب را نگه می‌دارد. */
export function SignalHistoryList({ items }: { items: SignalHistoryItem[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const expanded = expandedId === item.id;
        return (
          <li key={item.id} className="border-b border-border/60 pb-2 text-xs last:border-0">
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : item.id)}
              className="flex w-full flex-wrap items-center gap-2 text-right"
            >
              <span
                className={`rounded px-2 py-0.5 font-bold ${
                  item.direction === "buy" ? "bg-up/20 text-up" : item.direction === "sell" ? "bg-down/20 text-down" : "bg-surface-2 text-muted"
                }`}
              >
                {item.direction === "buy" ? "خرید" : item.direction === "sell" ? "فروش" : item.direction}
              </span>
              <span className="ltr-nums text-muted">{formatJalaliDateTime(item.createdAt)}</span>
            </button>
            {expanded && (
              <div className="mt-2">
                <SignalReasonBreakdown score={item.score} direction={item.direction} regime={item.regime} reasons={item.reasons} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
