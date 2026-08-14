import type { MarketRegime } from "./marketRegime.ts";
import { DAILY_PRICE_BAND_PCT } from "./marketRules.ts";

export interface PositionSizingInput {
  capital: number;
  riskPerTradePct: number;
  entryPrice: number;
  stopLossPrice: number;
  regime: MarketRegime;
  regimeMultiplier: Record<string, number>;
  maxSinglePositionPct: number;
  /** دامنهٔ نوسان مجاز یک جلسهٔ معاملاتی، درصد؛ پیش‌فرض از DAILY_PRICE_BAND_PCT (lib/marketRules.ts). */
  bandPct?: number;
  /** از lib/tabloo.ts::queueState روی آخرین quote زندهٔ نماد — اختیاری چون همیشه در دسترس نیست. */
  queueLocked?: { buy: boolean | null; sell: boolean | null };
}

export interface PositionSizingResult {
  shareCount: number;
  capitalAtRisk: number;
  positionValue: number;
  warnings: string[];
}

const DEFAULT_BAND_PCT = DAILY_PRICE_BAND_PCT;

/**
 * اندازهٔ پوزیشن را «محدود» می‌کند، تصمیم نمی‌گیرد (اصل طراحی فاز ۸). ریسک مجاز تومانی از
 * سرمایه × درصد ریسک هر معامله × ضریب رژیم به دست می‌آید؛ تعداد سهم = ریسک مجاز ÷ فاصلهٔ
 * ورود-حدضرر. اگر ارزش پوزیشن از سقف مجاز هر نماد بگذرد، به همان سقف محدود می‌شود (نه رد).
 */
export function calculatePositionSize(input: PositionSizingInput): PositionSizingResult {
  const {
    capital,
    riskPerTradePct,
    entryPrice,
    stopLossPrice,
    regime,
    regimeMultiplier,
    maxSinglePositionPct,
    bandPct = DEFAULT_BAND_PCT,
    queueLocked,
  } = input;

  const warnings: string[] = [];

  if (capital <= 0 || entryPrice <= 0) {
    return { shareCount: 0, capitalAtRisk: 0, positionValue: 0, warnings: ["سرمایه یا قیمت ورود نامعتبر است"] };
  }

  const riskPerShare = Math.abs(entryPrice - stopLossPrice);
  if (riskPerShare === 0) {
    return {
      shareCount: 0,
      capitalAtRisk: 0,
      positionValue: 0,
      warnings: ["حد ضرر نمی‌تواند برابر قیمت ورود باشد"],
    };
  }

  const multiplier = regimeMultiplier[regime] ?? 1;
  const allowedRisk = capital * (riskPerTradePct / 100) * multiplier;

  let shareCount = Math.floor(allowedRisk / riskPerShare);
  let positionValue = shareCount * entryPrice;

  const maxPositionValue = capital * (maxSinglePositionPct / 100);
  if (positionValue > maxPositionValue) {
    shareCount = Math.floor(maxPositionValue / entryPrice);
    positionValue = shareCount * entryPrice;
    warnings.push("اندازهٔ پوزیشن به سقف مجاز هر نماد (max_single_position_pct) محدود شد؛ ریسک واقعی کمتر از ریسک مجاز است");
  }

  const capitalAtRisk = shareCount * riskPerShare;

  const stopDistancePct = (riskPerShare / entryPrice) * 100;
  if (stopDistancePct > bandPct) {
    warnings.push(
      `حد ضرر ${stopDistancePct.toFixed(1)}٪ با قیمت ورود فاصله دارد، بیش از دامنهٔ نوسان مجاز یک جلسه (±${bandPct}٪) — رسیدن قیمت به آن ممکن است چند روز طول بکشد، نه یک جهش`,
    );
  }

  if (queueLocked?.sell) {
    warnings.push("حد ضرر در صورت قفل صف فروش ممکن است قابل اجرا نباشد؛ ریسک واقعی بیشتر از محاسبه‌شده است");
  }
  if (queueLocked?.buy) {
    warnings.push("صف خرید این نماد الان قفل است؛ ورود به این قیمت ممکن است هم‌اکنون قابل اجرا نباشد");
  }

  if (shareCount <= 0) {
    warnings.push("با این تنظیمات ریسک، حتی یک سهم هم قابل خرید نیست");
  }

  return { shareCount, capitalAtRisk, positionValue, warnings };
}

/**
 * پیشنهاد خودکار حد ضرر برای پرکردن پیش‌فرض ورودی صفحهٔ سیگنال‌ها (کاربر می‌تواند دستی جایگزین
 * کند): entry − ۱٫۵×ATR14. یک قاعدهٔ رایج و قابل توضیح، نه توصیهٔ قطعی — چون سیستم فعلاً هیچ
 * مفهوم حد ضرر ندارد و کاربر بی‌تجربه است، این تنها نقطهٔ شروع محاسباتی (data-driven، نه عدد
 * ثابت) است تا حداقل با نوسان واقعی هر نماد تطبیق پیدا کند.
 */
export function suggestStopLossFromAtr(entryPrice: number, atrValue: number, multiplier = 1.5): number {
  return entryPrice - atrValue * multiplier;
}

/**
 * هشدار غیرمسدودکننده برای فرم ثبت دستی معامله: چون paper_trades فقط long است، حد ضرر
 * مساوی یا بالاتر از قیمت ورود منطقی نیست. فقط هشدار می‌دهد، ثبت را رد نمی‌کند.
 */
export function getStopLossWarnings(entryPrice: number, stopLossPrice: number): string[] {
  if (entryPrice <= 0) return [];
  if (stopLossPrice >= entryPrice) {
    return ["حد ضرر مساوی یا بالاتر از قیمت ورود است — چون این دفتر فقط پوزیشن خرید (long) دارد، منطقی نیست"];
  }
  return [];
}
