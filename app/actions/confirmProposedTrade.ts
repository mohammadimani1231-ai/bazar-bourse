"use server";

import { getPositionSizingContext } from "@/lib/chat/context.ts";
import { openPaperTrade } from "./paperTrades.ts";

export interface ConfirmProposedTradeResult {
  status: "success" | "partial" | "error";
  shouldRetry?: boolean;
  error?: string;
  proposal?: {
    symbol: string;
    direction: "buy";
    entryPrice: number;
    suggestedStopLoss: number;
    suggestedShareCount: number;
    capitalAtRisk: number;
    positionValue: number;
    warnings: string[];
    disclaimerText: string;
  };
}

/**
 * re-validation قبل از ثبت معامله.
 *
 * قبل از اینکه openPaperTrade صدا زده شود:
 * 1. قیمت زنده را دوباره می‌خواند
 * 2. تمام محاسبات (ATR، اندازهٔ پوزیشن، حد ضرر، کارمزد) را با دادهٔ تازه انجام می‌دهد
 * 3. اگر success بود → openPaperTrade صدا زده می‌شود و معامله ثبت می‌شود
 */
export async function confirmProposedTrade(
  symbol: string,
  proposalEntryPrice: number,
): Promise<ConfirmProposedTradeResult> {
  try {
    if (!symbol || !proposalEntryPrice || proposalEntryPrice <= 0) {
      return {
        status: "error",
        error: "نماد یا قیمت پیشنهادی نامعتبر است",
      };
    }

    // دریافت context تازه (قیمت زنده + محاسبات)
    const freshContext = await getPositionSizingContext(symbol, proposalEntryPrice);
    if (!freshContext) {
      return {
        status: "error",
        error: "نمی‌توانم دادهٔ تازهٔ نماد را بخوانم. دوباره تلاش کنید.",
        shouldRetry: true,
      };
    }

    // ثبت معامله با دادهٔ تازه
    try {
      await openPaperTrade({
        symbol,
        signalId: null,
        entryPrice: proposalEntryPrice,
        stopLoss: freshContext.suggestedStopLoss,
        shareCount: freshContext.suggestedShareCount,
        notes: `re-validated | ریسک: ${freshContext.capitalAtRisk.toLocaleString("fa-IR")} تومان`,
      });

      return {
        status: "success",
        proposal: {
          symbol,
          direction: "buy",
          entryPrice: proposalEntryPrice,
          suggestedStopLoss: freshContext.suggestedStopLoss,
          suggestedShareCount: freshContext.suggestedShareCount,
          capitalAtRisk: freshContext.capitalAtRisk,
          positionValue: freshContext.positionValue,
          warnings: freshContext.warnings,
          disclaimerText:
            "این پیشنهاد بر پایهٔ تنظیمات ریسک موجود و ATR14 محاسبہ‌شده است. تصمیم و ریسک نهایی بشماستِ.",
        },
      };
    } catch (dbError) {
      return {
        status: "error",
        error: `خطا در ثبت معامله: ${dbError instanceof Error ? dbError.message : "نامعلوم"}`,
      };
    }
  } catch (error) {
    return {
      status: "error",
      error: `خطای عمومی: ${error instanceof Error ? error.message : "نامعلوم"}`,
    };
  }
}
