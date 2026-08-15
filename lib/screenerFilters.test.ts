import { describe, expect, it } from "vitest";
import {
  applyScreenerFilters,
  DEFAULT_SCREENER_FILTERS,
  type ScreenerRow,
} from "./screenerFilters.ts";

const rows: ScreenerRow[] = [
  {
    symbol: "فملی",
    companyName: "ملی صنایع مس ایران",
    industry: "فلزات اساسی",
    tradeValue: 5_000_000_000,
    rsi14: 25,
    compositeRank: 80,
    maDistancePct: 3,
    distanceFromHigh3mPct: -10,
    distanceFromHigh1yPct: -20,
    distanceFromHigh3mGap: false,
    distanceFromHigh1yGap: false,
    buyerPower: 2.5,
    moneyFlow: 1_000_000,
    suspiciousVolume: true,
  },
  {
    symbol: "خودرو",
    companyName: "ایران خودرو",
    industry: "خودرو و ساخت قطعات",
    tradeValue: 1_000_000_000,
    rsi14: 60,
    compositeRank: 30,
    maDistancePct: -5,
    distanceFromHigh3mPct: 2,
    distanceFromHigh1yPct: 5,
    distanceFromHigh3mGap: false,
    distanceFromHigh1yGap: false,
    buyerPower: 0.8,
    moneyFlow: -500_000,
    suspiciousVolume: false,
  },
];

describe("applyScreenerFilters", () => {
  it("بدون فیلتر همه ردیف‌ها را برمی‌گرداند", () => {
    expect(applyScreenerFilters(rows, DEFAULT_SCREENER_FILTERS)).toHaveLength(2);
  });

  it("فیلتر صنعت", () => {
    const result = applyScreenerFilters(rows, { ...DEFAULT_SCREENER_FILTERS, industries: ["فلزات اساسی"] });
    expect(result.map((r) => r.symbol)).toEqual(["فملی"]);
  });

  it("فیلتر بازه RSI", () => {
    const result = applyScreenerFilters(rows, { ...DEFAULT_SCREENER_FILTERS, rsi: { min: 50, max: 70 } });
    expect(result.map((r) => r.symbol)).toEqual(["خودرو"]);
  });

  it("فیلتر حجم مشکوک only", () => {
    const result = applyScreenerFilters(rows, { ...DEFAULT_SCREENER_FILTERS, suspiciousVolume: "only" });
    expect(result.map((r) => r.symbol)).toEqual(["فملی"]);
  });

  it("فیلتر حجم مشکوک exclude", () => {
    const result = applyScreenerFilters(rows, { ...DEFAULT_SCREENER_FILTERS, suspiciousVolume: "exclude" });
    expect(result.map((r) => r.symbol)).toEqual(["خودرو"]);
  });

  it("چند فیلتر با هم (AND)", () => {
    const result = applyScreenerFilters(rows, {
      ...DEFAULT_SCREENER_FILTERS,
      buyerPower: { min: 1, max: null },
      compositeRank: { min: 50, max: null },
    });
    expect(result.map((r) => r.symbol)).toEqual(["فملی"]);
  });

  it("مقدار null در ردیف وقتی بازه‌ای تعیین شده نادیده گرفته می‌شود", () => {
    const rowsWithNull: ScreenerRow[] = [{ ...rows[0], rsi14: null }];
    const result = applyScreenerFilters(rowsWithNull, { ...DEFAULT_SCREENER_FILTERS, rsi: { min: 0, max: 100 } });
    expect(result).toHaveLength(0);
  });
});
