import { describe, expect, it } from "vitest";
import { checkPortfolioLimits, type PortfolioLimitsInput } from "./portfolioLimits.ts";

function baseInput(overrides: Partial<PortfolioLimitsInput> = {}): PortfolioLimitsInput {
  return {
    newIndustry: "خودرو",
    newPositionValue: 10_000_000,
    openPositions: [],
    totalCapital: 100_000_000,
    maxConcurrentPositions: 8,
    maxSectorExposurePct: 30,
    ...overrides,
  };
}

describe("checkPortfolioLimits", () => {
  it("بدون هیچ محدودیتی: بدون هشدار، بلاک نشده", () => {
    const result = checkPortfolioLimits(baseInput());
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it("رسیدن به سقف تعداد پوزیشن → بلاک می‌شود", () => {
    const openPositions = Array.from({ length: 8 }, (_, i) => ({
      symbol: `SYM${i}`,
      industry: "سایر",
      positionValue: 1_000_000,
    }));
    const result = checkPortfolioLimits(baseInput({ openPositions }));
    expect(result.blocked).toBe(true);
    expect(result.warnings.some((w) => w.includes("سقف مجاز"))).toBe(true);
  });

  it("زیر سقف تعداد پوزیشن → بلاک نمی‌شود", () => {
    const openPositions = Array.from({ length: 7 }, (_, i) => ({
      symbol: `SYM${i}`,
      industry: "سایر",
      positionValue: 1_000_000,
    }));
    const result = checkPortfolioLimits(baseInput({ openPositions }));
    expect(result.blocked).toBe(false);
  });

  it("تمرکز صنعتی بیش از سقف → هشدار (نه بلاک)", () => {
    const openPositions = [{ symbol: "خودرو1", industry: "خودرو", positionValue: 25_000_000 }];
    // (25M + 10M جدید) / 100M = 35٪ > سقف 30٪
    const result = checkPortfolioLimits(baseInput({ openPositions }));
    expect(result.blocked).toBe(false);
    expect(result.warnings.some((w) => w.includes("خودرو"))).toBe(true);
  });

  it("پوزیشن‌های صنعت دیگر در محاسبهٔ تمرکز صنعتی حساب نمی‌شوند", () => {
    const openPositions = [{ symbol: "فملی", industry: "فلزات", positionValue: 25_000_000 }];
    const result = checkPortfolioLimits(baseInput({ openPositions }));
    expect(result.warnings.some((w) => w.includes("تمرکز") || w.includes("صنعت"))).toBe(false);
  });

  it("همبستگی بالا با یک پوزیشن باز → هشدار تمرکز ریسک", () => {
    const result = checkPortfolioLimits(
      baseInput({ correlations: [{ symbol: "شپنا", correlation: 0.85 }] }),
    );
    expect(result.warnings.some((w) => w.includes("شپنا"))).toBe(true);
  });

  it("همبستگی زیر آستانه هشدار نمی‌دهد", () => {
    const result = checkPortfolioLimits(
      baseInput({ correlations: [{ symbol: "شپنا", correlation: 0.4 }] }),
    );
    expect(result.warnings.some((w) => w.includes("شپنا"))).toBe(false);
  });

  it("همبستگی null (داده ناکافی) نادیده گرفته می‌شود، نه خطا", () => {
    const result = checkPortfolioLimits(
      baseInput({ correlations: [{ symbol: "شپنا", correlation: null }] }),
    );
    expect(result.warnings.some((w) => w.includes("شپنا"))).toBe(false);
  });
});
