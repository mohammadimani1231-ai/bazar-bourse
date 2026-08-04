"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/adminClient.ts";
import type { ScreenerFilters } from "@/lib/screenerFilters.ts";

export async function savePreset(name: string, filters: ScreenerFilters) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("نام preset نمی‌تواند خالی باشد");

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from("screener_presets").insert({ name: trimmed, filters });
  if (error) throw new Error(error.message);

  revalidatePath("/screener");
}

export async function addToWatchlist(symbol: string, industry: string | null) {
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("watchlist")
    .upsert({ symbol, industry, market: "tse" }, { onConflict: "symbol", ignoreDuplicates: true });
  if (error) throw new Error(error.message);

  revalidatePath("/screener");
}
