/**
 * lib/chat/proposePaperTrade.ts
 *
 * Tool call ساختاریافتهٔ مدل (نه Server Action سادہ).
 *
 * مدل این تابع را صدا می‌زند تا یک پیشنهاد اندازهٔ پوزیشن تولید کند.
 * خروجی یک JSON ساختاریافتہ است که UI یک کارتِ تایید می‌سازد.
 * فقط کلیک‌کننده‌ی تایید کاربر روی دکمۂ UI باید openPaperTrade (Server Action موجود) را صدا بزند.
 *
 * قید #14 CLAUDE.md: هیچ loop خودآموزی خودکار نیست. فقط محاسبہ + نمایش + کلیک انسانی.
 */

import { getPositionSizingContext } from "./context.ts";

export interface ProposePaperTradeResult {
  status: "success" | "error";
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
 * مدل صدا می‌زند تا پیشنهاد اندازهٔ پوزیشن برای یک سیگنال خرید دریافت کند.
 */
export async function proposePaperTrade(
  symbol: string,
  entryPrice: number,
): Promise<ProposePaperTradeResult> {
  try {
    // اعتبارسنجی ورودی
    if (!symbol || !entryPrice || entryPrice <= 0) {
      return {
        status: "error",
        error: "نماد یا قیمت ورود نامعتبر است",
      };
    }

    // context محاسبہ
    const context = await getPositionSizingContext(symbol, entryPrice);
    if (!context) {
      return {
        status: "error",
        error: "نمی‌توانم اطلاعات ریسک/تنظیمات برای این نماد پیدا کنم",
      };
    }

    // disclaimer ثابت (قید #2 در spec v1)
    const disclaimerText =
      "این پیشنهاد بر پایهٔ تنظیمات ریسک موجود و ATR14 محاسبہ‌شده است. تصمیم و ریسک نهایی بشماستِ.";

    return {
      status: "success",
      proposal: {
        symbol,
        direction: "buy",
        entryPrice,
        suggestedStopLoss: context.suggestedStopLoss,
        suggestedShareCount: context.suggestedShareCount,
        capitalAtRisk: context.capitalAtRisk,
        positionValue: context.positionValue,
        warnings: context.warnings,
        disclaimerText,
      },
    };
  } catch (error) {
    return {
      status: "error",
      error: `خطای سرور: ${error instanceof Error ? error.message : "نامعلوم"}`,
    };
  }
}

