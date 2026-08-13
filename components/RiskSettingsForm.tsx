"use client";

import { useState, useTransition } from "react";
import { updateRiskSettings } from "@/app/actions/risk.ts";
import { MARKET_REGIMES, type MarketRegime } from "@/lib/marketRegime.ts";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";

const REGIME_LABELS: Record<MarketRegime, string> = {
  normal: "عادی",
  war_risk: "تنش",
  agreement_hope: "امید توافق",
};

interface RiskSettingsFormValues {
  total_capital: number | null;
  max_risk_per_trade_pct: number;
  max_concurrent_positions: number;
  max_sector_exposure_pct: number;
  max_single_position_pct: number;
  regime_risk_multiplier: Record<string, number>;
}

const inputClass =
  "w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground ltr-nums transition-colors hover:border-accent/50 focus:border-accent focus:outline-none";
const labelClass = "mb-1 block text-xs text-muted";

export function RiskSettingsForm({ initial }: { initial: RiskSettingsFormValues }) {
  const [totalCapital, setTotalCapital] = useState(initial.total_capital ?? 0);
  const [maxRiskPerTradePct, setMaxRiskPerTradePct] = useState(initial.max_risk_per_trade_pct);
  const [maxConcurrentPositions, setMaxConcurrentPositions] = useState(initial.max_concurrent_positions);
  const [maxSectorExposurePct, setMaxSectorExposurePct] = useState(initial.max_sector_exposure_pct);
  const [maxSinglePositionPct, setMaxSinglePositionPct] = useState(initial.max_single_position_pct);
  const [regimeMultiplier, setRegimeMultiplier] = useState<Record<string, number>>(initial.regime_risk_multiplier);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateRiskSettings({
          totalCapital,
          maxRiskPerTradePct,
          maxConcurrentPositions,
          maxSectorExposurePct,
          maxSinglePositionPct,
          regimeRiskMultiplier: regimeMultiplier,
        });
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "ذخیره ناموفق بود");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4 rounded-lg border border-border bg-surface shadow-card p-4">
      <div>
        <label className={labelClass}>کل سرمایهٔ قابل تخصیص (ریال)</label>
        <FormattedNumberInput
          className={inputClass}
          placeholder="۰"
          value={totalCapital}
          onChange={(v) => setTotalCapital(v === "" ? 0 : v)}
        />
      </div>

      <div>
        <label className={labelClass}>حداکثر درصد ریسک هر معامله</label>
        <input
          type="number"
          min={0.1}
          max={100}
          step={0.1}
          className={inputClass}
          value={maxRiskPerTradePct}
          onChange={(e) => setMaxRiskPerTradePct(Number(e.target.value))}
        />
      </div>

      <div>
        <label className={labelClass}>حداکثر تعداد پوزیشن هم‌زمان</label>
        <input
          type="number"
          min={1}
          className={inputClass}
          value={maxConcurrentPositions}
          onChange={(e) => setMaxConcurrentPositions(Number(e.target.value))}
        />
      </div>

      <div>
        <label className={labelClass}>حداکثر درصد سرمایه در یک صنعت</label>
        <input
          type="number"
          min={1}
          max={100}
          className={inputClass}
          value={maxSectorExposurePct}
          onChange={(e) => setMaxSectorExposurePct(Number(e.target.value))}
        />
      </div>

      <div>
        <label className={labelClass}>حداکثر درصد سرمایه در یک نماد</label>
        <input
          type="number"
          min={1}
          max={100}
          className={inputClass}
          value={maxSinglePositionPct}
          onChange={(e) => setMaxSinglePositionPct(Number(e.target.value))}
        />
      </div>

      <div>
        <label className={labelClass}>ضریب ریسک بر اساس رژیم بازار</label>
        <div className="flex flex-col gap-2">
          {MARKET_REGIMES.map((regime) => (
            <div key={regime} className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted">{REGIME_LABELS[regime]}</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                className={`${inputClass} w-24`}
                value={regimeMultiplier[regime] ?? 1}
                onChange={(e) =>
                  setRegimeMultiplier((prev) => ({ ...prev, [regime]: Number(e.target.value) }))
                }
              />
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-down">{error}</p>}
      {saved && !error && <p className="text-xs text-up">ذخیره شد.</p>}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-accent px-3 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "در حال ذخیره..." : "ذخیره"}
      </button>
    </form>
  );
}
