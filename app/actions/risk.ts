"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/adminClient.ts";
import { MARKET_REGIMES } from "@/lib/marketRegime.ts";

export interface RiskSettingsInput {
  totalCapital: number;
  maxRiskPerTradePct: number;
  maxConcurrentPositions: number;
  maxSectorExposurePct: number;
  maxSinglePositionPct: number;
  regimeRiskMultiplier: Record<string, number>;
}

export async function updateRiskSettings(input: RiskSettingsInput) {
  for (const regime of MARKET_REGIMES) {
    if (typeof input.regimeRiskMultiplier[regime] !== "number") {
      throw new Error(`ضریب ریسک رژیم «${regime}» نامعتبر است`);
    }
  }
  if (input.totalCapital < 0) throw new Error("سرمایه نمی‌تواند منفی باشد");
  if (input.maxRiskPerTradePct <= 0 || input.maxRiskPerTradePct > 100) throw new Error("درصد ریسک هر معامله نامعتبر است");
  if (input.maxConcurrentPositions < 1) throw new Error("حداکثر پوزیشن هم‌زمان باید حداقل ۱ باشد");
  if (input.maxSectorExposurePct <= 0 || input.maxSectorExposurePct > 100) throw new Error("درصد تمرکز صنعتی نامعتبر است");
  if (input.maxSinglePositionPct <= 0 || input.maxSinglePositionPct > 100) throw new Error("درصد سقف پوزیشن نامعتبر است");

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("risk_settings")
    .update({
      total_capital: input.totalCapital,
      max_risk_per_trade_pct: input.maxRiskPerTradePct,
      max_concurrent_positions: input.maxConcurrentPositions,
      max_sector_exposure_pct: input.maxSectorExposurePct,
      max_single_position_pct: input.maxSinglePositionPct,
      regime_risk_multiplier: input.regimeRiskMultiplier,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/risk");
  revalidatePath("/signals");
}
