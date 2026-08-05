"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/adminClient.ts";

export interface OpenPaperTradeInput {
  symbol: string;
  signalId: number | null;
  entryPrice: number;
  stopLoss: number | null;
  shareCount: number;
  notes: string | null;
}

export async function openPaperTrade(input: OpenPaperTradeInput) {
  if (!input.symbol.trim()) throw new Error("نماد الزامی است");
  if (input.entryPrice <= 0) throw new Error("قیمت ورود نامعتبر است");
  if (input.shareCount <= 0) throw new Error("تعداد سهم نامعتبر است");

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from("paper_trades").insert({
    symbol: input.symbol,
    signal_id: input.signalId,
    entry_price: input.entryPrice,
    stop_loss: input.stopLoss,
    share_count: input.shareCount,
    notes: input.notes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/portfolio");
}

export async function closePaperTrade(id: number, exitPrice: number) {
  if (exitPrice <= 0) throw new Error("قیمت خروج نامعتبر است");

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("paper_trades")
    .update({
      exit_price: exitPrice,
      exit_date: new Date().toISOString().slice(0, 10),
      status: "closed",
    })
    .eq("id", id)
    .eq("status", "open");
  if (error) throw new Error(error.message);

  revalidatePath("/portfolio");
}
