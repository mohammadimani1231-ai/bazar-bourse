import { describe, expect, it } from "vitest";
import { computeJalaliSeasonality } from "./seasonality.ts";

describe("computeJalaliSeasonality", () => {
  it("بازده هر روز را به ماه شمسی همان روز نسبت می‌دهد و میانگین می‌گیرد", () => {
    // 04-15..04-17 داخل فروردین (ماه ۱)، 04-25..04-26 داخل اردیبهشت (ماه ۲) — تأییدشده جداگانه
    const result = computeJalaliSeasonality([
      { date: "2026-04-15", value: 100 },
      { date: "2026-04-16", value: 90 }, // -10% → فروردین
      { date: "2026-04-17", value: 81 }, // -10% → فروردین
      { date: "2026-04-25", value: 89.1 }, // +10% → اردیبهشت
      { date: "2026-04-26", value: 98.01 }, // +10% → اردیبهشت
    ]);

    const farvardin = result.find((r) => r.month === 1)!;
    const ordibehesht = result.find((r) => r.month === 2)!;

    expect(farvardin.avgReturnPct).toBeCloseTo(-10, 5);
    expect(farvardin.sampleSize).toBe(2);
    expect(ordibehesht.avgReturnPct).toBeCloseTo(10, 5);
    expect(ordibehesht.monthName).toBe("اردیبهشت");
  });

  it("همیشه ۱۲ ماه برمی‌گرداند، حتی اگر داده نداشته باشند", () => {
    const result = computeJalaliSeasonality([
      { date: "2026-04-15", value: 100 },
      { date: "2026-04-16", value: 110 },
    ]);
    expect(result).toHaveLength(12);
    const emptyMonths = result.filter((r) => r.sampleSize === 0);
    expect(emptyMonths.length).toBe(11);
  });

  it("ماه بدون داده avgReturnPct=null دارد نه صفر یا NaN", () => {
    const result = computeJalaliSeasonality([]);
    expect(result.every((r) => r.avgReturnPct === null)).toBe(true);
  });
});
