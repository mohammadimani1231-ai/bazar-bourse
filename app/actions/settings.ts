"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/adminClient.ts";
import { MARKET_REGIMES, type MarketRegime } from "@/lib/marketRegime.ts";

export async function setMarketRegime(regime: MarketRegime) {
  if (!MARKET_REGIMES.includes(regime)) throw new Error("رژیم نامعتبر");

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("settings")
    .upsert({ key: "market_regime", value: regime, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
}
