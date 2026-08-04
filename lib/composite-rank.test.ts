import { describe, expect, it } from "vitest";
import { computeRawScore, percentileRank } from "./composite-rank.ts";

function risingSeries(length: number, start = 100, step = 0.3): number[] {
  return Array.from({ length }, (_, i) => start + i * step);
}

function fallingSeries(length: number, start = 200, step = 0.3): number[] {
  return Array.from({ length }, (_, i) => start - i * step);
}

describe("computeRawScore", () => {
  it("با کمتر از ۲۰۰ کندل، rawScore=null و همهٔ اجزا null است", () => {
    const result = computeRawScore(risingSeries(199));
    expect(result.rawScore).toBeNull();
    expect(result.components.distFromEma200Pct).toBeNull();
  });

  it("درست با ۲۰۰ کندل، rawScore محاسبه می‌شود", () => {
    const result = computeRawScore(risingSeries(200));
    expect(result.rawScore).not.toBeNull();
  });

  it("روند صعودی پایدار → rawScore مثبت (قیمت بالای EMAها، ROC مثبت)", () => {
    const result = computeRawScore(risingSeries(250));
    expect(result.rawScore).toBeGreaterThan(0);
    expect(result.components.distFromEma200Pct).toBeGreaterThan(0);
    expect(result.components.roc125).toBeGreaterThan(0);
  });

  it("روند نزولی پایدار → rawScore منفی", () => {
    const result = computeRawScore(fallingSeries(250));
    expect(result.rawScore).toBeLessThan(0);
    expect(result.components.distFromEma200Pct).toBeLessThan(0);
  });
});

describe("percentileRank", () => {
  it("کمترین rawScore رتبهٔ ۰ و بیشترین رتبهٔ ۹۹ می‌گیرد", () => {
    const ranked = percentileRank([
      { symbol: "A", rawScore: 10 },
      { symbol: "B", rawScore: 50 },
      { symbol: "C", rawScore: -5 },
    ]);
    const bySymbol = Object.fromEntries(ranked.map((r) => [r.symbol, r.rank]));
    expect(bySymbol.C).toBe(0);
    expect(bySymbol.B).toBe(99);
    expect(bySymbol.A).toBeGreaterThan(bySymbol.C);
    expect(bySymbol.A).toBeLessThan(bySymbol.B);
  });

  it("نمادهای با rawScore=null از رتبه‌بندی کنار گذاشته می‌شوند", () => {
    const ranked = percentileRank([
      { symbol: "A", rawScore: 10 },
      { symbol: "B", rawScore: null },
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].symbol).toBe("A");
  });

  it("با یک نماد تنها، رتبهٔ ۹۹ می‌گیرد", () => {
    const ranked = percentileRank([{ symbol: "A", rawScore: 10 }]);
    expect(ranked[0].rank).toBe(99);
  });
});
