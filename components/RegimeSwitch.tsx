"use client";

import { useTransition } from "react";
import { setMarketRegime } from "@/app/actions/settings.ts";
import { MARKET_REGIMES, type MarketRegime } from "@/lib/marketRegime.ts";

const LABELS: Record<MarketRegime, string> = {
  normal: "عادی",
  war_risk: "تنش",
  agreement_hope: "امید توافق",
};

export function RegimeSwitch({ current }: { current: MarketRegime }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface shadow-card p-3">
      <span className="text-sm font-bold">رژیم بازار</span>
      <div className="flex gap-1">
        {MARKET_REGIMES.map((regime) => (
          <button
            key={regime}
            disabled={isPending}
            onClick={() => startTransition(() => setMarketRegime(regime))}
            className={`rounded-full px-3 py-1 text-xs disabled:opacity-50 ${
              current === regime ? "bg-accent text-white" : "bg-surface-2 text-muted hover:text-foreground"
            }`}
          >
            {LABELS[regime]}
          </button>
        ))}
      </div>
    </div>
  );
}
