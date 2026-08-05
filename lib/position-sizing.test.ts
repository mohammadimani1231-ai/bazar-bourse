import { describe, expect, it } from "vitest";
import { calculatePositionSize, suggestStopLossFromAtr, type PositionSizingInput } from "./position-sizing.ts";

const REGIME_MULTIPLIER = { normal: 1, war_risk: 0.5, agreement_hope: 0.75 };

function baseInput(overrides: Partial<PositionSizingInput> = {}): PositionSizingInput {
  return {
    capital: 100_000_000,
    riskPerTradePct: 1.5,
    entryPrice: 1000,
    stopLossPrice: 950, // فاصله ۵٪ از ورود
    regime: "normal",
    regimeMultiplier: REGIME_MULTIPLIER,
    maxSinglePositionPct: 50, // به‌اندازهٔ کافی بزرگ که تست پایه به سقف پوزیشن برخورد نکند
    ...overrides,
  };
}

describe("calculatePositionSize", () => {
  it("حالت پایه: ریسک مجاز ÷ فاصلهٔ ورود-حدضرر", () => {
    // ریسک مجاز = 100,000,000 × 1.5% × 1 = 1,500,000 → تعداد سهم = 1,500,000 / 50 = 30,000
    const result = calculatePositionSize(baseInput());
    expect(result.shareCount).toBe(30_000);
    expect(result.capitalAtRisk).toBe(30_000 * 50);
    expect(result.positionValue).toBe(30_000 * 1000);
    expect(result.warnings.some((w) => w.includes("سقف مجاز"))).toBe(false);
  });

  it("ضریب رژیم ریسک مجاز را کم می‌کند (war_risk=0.5)", () => {
    const result = calculatePositionSize(baseInput({ regime: "war_risk" }));
    // ریسک مجاز نصف می‌شود → تعداد سهم هم نصف
    expect(result.shareCount).toBe(15_000);
  });

  it("عبور از سقف پوزیشن: به max_single_position_pct محدود و warning می‌دهد", () => {
    // سقف پوزیشن = 100,000,000 × 15% = 15,000,000 → حداکثر 15,000 سهم به قیمت 1000
    // ولی بدون سقف، ریسک مجاز 30,000 سهم می‌خواست (تست بالا) — پس باید محدود شود
    const result = calculatePositionSize(baseInput({ maxSinglePositionPct: 1 }));
    const maxShares = Math.floor((100_000_000 * 0.01) / 1000);
    expect(result.shareCount).toBe(maxShares);
    expect(result.warnings.some((w) => w.includes("سقف مجاز"))).toBe(true);
  });

  it("دامنهٔ نوسان: حد ضرر دورتر از ±۵٪ هشدار می‌دهد", () => {
    const result = calculatePositionSize(baseInput({ stopLossPrice: 800 })); // ۲۰٪ فاصله
    expect(result.warnings.some((w) => w.includes("دامنهٔ نوسان"))).toBe(true);
  });

  it("دامنهٔ نوسان: حد ضرر داخل ±۵٪ هشداری نمی‌دهد", () => {
    const result = calculatePositionSize(baseInput({ stopLossPrice: 970 })); // ۳٪ فاصله
    expect(result.warnings.some((w) => w.includes("دامنهٔ نوسان"))).toBe(false);
  });

  it("قفل صف فروش هشدار می‌دهد که حد ضرر ممکن است قابل اجرا نباشد", () => {
    const result = calculatePositionSize(baseInput({ queueLocked: { buy: false, sell: true } }));
    expect(result.warnings.some((w) => w.includes("قفل صف فروش"))).toBe(true);
  });

  it("قفل صف خرید هشدار می‌دهد که ورود ممکن است قابل اجرا نباشد", () => {
    const result = calculatePositionSize(baseInput({ queueLocked: { buy: true, sell: false } }));
    expect(result.warnings.some((w) => w.includes("صف خرید"))).toBe(true);
  });

  it("بدون قفل صف، هشدار مربوطه داده نمی‌شود", () => {
    const result = calculatePositionSize(baseInput({ queueLocked: { buy: false, sell: false } }));
    expect(result.warnings.some((w) => w.includes("قفل صف"))).toBe(false);
  });

  it("حد ضرر برابر قیمت ورود → صفر سهم و هشدار صریح، نه تقسیم بر صفر", () => {
    const result = calculatePositionSize(baseInput({ stopLossPrice: 1000 }));
    expect(result.shareCount).toBe(0);
    expect(Number.isFinite(result.capitalAtRisk)).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("سرمایهٔ نامعتبر (صفر/منفی) → صفر سهم و هشدار، نه NaN", () => {
    const result = calculatePositionSize(baseInput({ capital: 0 }));
    expect(result.shareCount).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("suggestStopLossFromAtr", () => {
  it("entry منهای ضریب×ATR را برمی‌گرداند", () => {
    expect(suggestStopLossFromAtr(1000, 20, 1.5)).toBe(1000 - 30);
  });

  it("ضریب پیش‌فرض ۱٫۵ است", () => {
    expect(suggestStopLossFromAtr(1000, 20)).toBe(1000 - 30);
  });
});
