import { describe, expect, it } from "vitest";
import { detectCorrelationBreaks } from "./correlationBreaks.ts";

describe("detectCorrelationBreaks", () => {
  it("جفتی که همیشه هم‌بسته بوده ولی همین چند روز اخیر شکسته را پیدا می‌کند", () => {
    const pattern = [1, -1, 2, -2];
    const seriesA = [...pattern, ...pattern, ...pattern, ...pattern, ...pattern];
    const seriesB = [...pattern, ...pattern, ...pattern, ...pattern, ...pattern.map((v) => -v)];

    const breaks = detectCorrelationBreaks([{ label: "برنت × پالایشی", seriesA, seriesB }], 4, 0.4);

    expect(breaks).toHaveLength(1);
    expect(breaks[0].pairLabel).toBe("برنت × پالایشی");
    expect(breaks[0].currentCorrelation).toBeCloseTo(-1, 5);
    // پنجره‌های گذار (که هم داده‌ی قبل و هم بعد شکست را هم‌پوشانی می‌کنند) میانگین را کمی
    // پایین می‌آورند — نکتهٔ مهم این‌جا این‌ست که تاریخی به‌وضوح بالا بوده، نه دقیقاً ۱.
    expect(breaks[0].historicalMeanCorrelation).toBeGreaterThan(0.7);
  });

  it("جفتی که همبستگی‌اش پایدار مانده هیچ break‌ای نمی‌دهد", () => {
    const pattern = [1, -1, 2, -2];
    const seriesA = [...pattern, ...pattern, ...pattern, ...pattern, ...pattern];
    const seriesB = seriesA;

    const breaks = detectCorrelationBreaks([{ label: "پایدار", seriesA, seriesB }], 4, 0.4);
    expect(breaks).toHaveLength(0);
  });

  it("دادهٔ ناکافی برای پنجرهٔ غلتان → نادیده گرفته می‌شود، نه کرش", () => {
    const breaks = detectCorrelationBreaks([{ label: "کوتاه", seriesA: [1, 2], seriesB: [1, 2] }], 30, 0.4);
    expect(breaks).toEqual([]);
  });
});
