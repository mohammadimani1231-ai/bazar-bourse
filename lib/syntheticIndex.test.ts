import { describe, expect, it } from "vitest";
import { buildEqualWeightIndex } from "./syntheticIndex.ts";

describe("buildEqualWeightIndex", () => {
  it("دو نماد با سطح قیمتی متفاوت را بعد از rebase میانگین می‌گیرد", () => {
    const a = [
      { date: "2026-01-01", value: 100 },
      { date: "2026-01-02", value: 110 }, // +10%
    ];
    const b = [
      { date: "2026-01-01", value: 1000 },
      { date: "2026-01-02", value: 900 }, // -10%
    ];
    const result = buildEqualWeightIndex([a, b]);
    expect(result[0]).toEqual({ date: "2026-01-01", value: 100 });
    expect(result[1].value).toBeCloseTo(100, 10); // (+10% و -10% میانگین‌شان صفر است
  });

  it("فقط تاریخ‌های مشترک بین همهٔ سری‌ها لحاظ می‌شود", () => {
    const a = [
      { date: "2026-01-01", value: 100 },
      { date: "2026-01-02", value: 110 },
      { date: "2026-01-03", value: 120 },
    ];
    const b = [{ date: "2026-01-02", value: 50 }];
    const result = buildEqualWeightIndex([a, b]);
    expect(result.map((r) => r.date)).toEqual(["2026-01-02"]);
  });

  it("ورودی خالی خروجی خالی می‌دهد", () => {
    expect(buildEqualWeightIndex([])).toEqual([]);
    expect(buildEqualWeightIndex([[]])).toEqual([]);
  });
});
