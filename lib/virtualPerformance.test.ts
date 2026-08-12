import { describe, expect, it } from "vitest";
import {
  comparePortfolioToBenchmarks,
  computePortfolioMetrics,
  evaluateHorizons,
  evaluateTrade,
  seriesReturnPct,
  MIN_DAYS_FOR_CAGR,
  MIN_TRADES_FOR_RATIOS,
  type BenchmarkSeries,
  type ClosedVirtualTrade,
} from "./virtualPerformance.ts";

function series(points: [string, number][]): BenchmarkSeries {
  return { points: points.map(([date, close]) => ({ date, close })) };
}

const TEDPIX = series([
  ["2026-01-01", 1000],
  ["2026-01-05", 1100],
  ["2026-01-10", 1200],
]);

const SYMBOL = series([
  ["2026-01-01", 500],
  ["2026-01-05", 600],
  ["2026-01-10", 550],
]);

function trade(overrides: Partial<ClosedVirtualTrade> = {}): ClosedVirtualTrade {
  return {
    symbol: "فملی",
    entryAt: "2026-01-01T06:00:00Z",
    exitAt: "2026-01-10T06:00:00Z",
    entryPrice: 500,
    exitPrice: 550,
    shareCount: 100,
    pnl: 4000,
    returnPct: 8,
    ...overrides,
  };
}

describe("بازده سری بین دو تاریخ", () => {
  it("تاریخ غیرمعاملاتی به نزدیک‌ترین تاریخ قبلی برمی‌گردد", () => {
    // ۰۱-۰۷ کندل ندارد → باید از ۰۱-۰۵ (=۱۱۰۰) استفاده کند
    expect(seriesReturnPct(TEDPIX, "2026-01-01", "2026-01-07")).toBeCloseTo(10, 10);
  });

  it("تاریخ قبل از شروع سری، null می‌دهد نه صفر", () => {
    expect(seriesReturnPct(TEDPIX, "2025-01-01", "2026-01-10")).toBeNull();
  });
});

describe("سه بنچمارک هر معامله", () => {
  it("Buy & Hold همان سهم، مهارت زمان‌بندی را جدا می‌کند", () => {
    const result = evaluateTrade(trade(), { tedpix: TEDPIX, symbol: SYMBOL });
    expect(result.tedpixPct).toBeCloseTo(20, 10);
    expect(result.buyAndHoldPct).toBeCloseTo(10, 10); // ۵۰۰ → ۵۵۰
    expect(result.excessVsTedpixPct).toBeCloseTo(-12, 10);
    expect(result.excessVsBuyAndHoldPct).toBeCloseTo(-2, 10);
    expect(result.holdingDays).toBe(9);
  });

  it("نبود سری بنچمارک، null می‌دهد نه صفر (عدد ساختگی ممنوع)", () => {
    const result = evaluateTrade(trade(), {});
    expect(result.tedpixPct).toBeNull();
    expect(result.tedpixEqualWeightPct).toBeNull();
    expect(result.excessVsTedpixPct).toBeNull();
  });
});

describe("ارزیابی چندافقی", () => {
  const LONG = series(
    Array.from({ length: 40 }, (_, i) => {
      const day = String(i + 1).padStart(2, "0");
      return [`2026-01-${day}`, 100 + i] as [string, number];
    }),
  );

  it("ورود با اولین روز بعد از سیگنال است، نه روز خود سیگنال (ضد look-ahead)", () => {
    const [h7] = evaluateHorizons([{ signalAt: "2026-01-01T06:00:00Z", symbol: "x" }], new Map([["x", LONG]]), [7]);
    // ورود ۰۱-۰۲ (=۱۰۱)، افق ۰۱-۰۹ (=۱۰۸)
    expect(h7.evaluated).toBe(1);
    expect(h7.avgReturnPct).toBeCloseTo(((108 - 101) / 101) * 100, 10);
  });

  it("سیگنالی که هنوز به افق نرسیده شمرده نمی‌شود (نه اینکه صفر فرض شود)", () => {
    const [h90] = evaluateHorizons([{ signalAt: "2026-01-01T06:00:00Z", symbol: "x" }], new Map([["x", LONG]]), [90]);
    expect(h90.evaluated).toBe(0);
    expect(h90.avgReturnPct).toBeNull();
    expect(h90.winRatePct).toBeNull();
  });

  it("نماد بدون سری، کل ارزیابی را خراب نمی‌کند", () => {
    const [h7] = evaluateHorizons([{ signalAt: "2026-01-01T06:00:00Z", symbol: "ناشناخته" }], new Map(), [7]);
    expect(h7.evaluated).toBe(0);
  });
});

describe("معیارهای تجمعی پرتفوی", () => {
  const equityPoints = [
    { date: "2026-01-01", equity: 100_000_000 },
    { date: "2026-01-10", equity: 104_000_000 },
  ];

  it("روی نمونهٔ کوچک، Sharpe و CAGR عدد نمی‌دهند و دلیلش ثبت می‌شود", () => {
    const metrics = computePortfolioMetrics({
      trades: [evaluateTrade(trade(), { tedpix: TEDPIX, symbol: SYMBOL })],
      equityPoints,
      initialCapital: 100_000_000,
    });

    expect(metrics.sharpe).toBeNull();
    expect(metrics.cagrPct).toBeNull();
    expect(metrics.sampleAdequate).toBe(false);
    expect(metrics.notes.some((n) => n.includes(String(MIN_TRADES_FOR_RATIOS)))).toBe(true);
    expect(metrics.notes.some((n) => n.includes(String(MIN_DAYS_FOR_CAGR)))).toBe(true);
  });

  it("بدون هیچ پوزیشن، بازده null است نه صفر («هنوز شروع نشده» ≠ «بازده صفر»)", () => {
    const metrics = computePortfolioMetrics({ trades: [], equityPoints: [], initialCapital: 100_000_000 });
    expect(metrics.totalReturnPct).toBeNull();
    expect(metrics.notes.some((n) => n.includes("هنوز هیچ پوزیشنی باز نشده"))).toBe(true);
  });

  it("بازده کل از منحنی سرمایه محاسبه می‌شود", () => {
    const metrics = computePortfolioMetrics({
      trades: [evaluateTrade(trade(), {})],
      equityPoints,
      initialCapital: 100_000_000,
    });
    expect(metrics.totalReturnPct).toBeCloseTo(4, 10);
    expect(metrics.periodDays).toBe(9);
    expect(metrics.avgHoldingDays).toBe(9);
  });

  it("٪ میانگین سرمایهٔ درگیر وقتی داده نیست null است", () => {
    const metrics = computePortfolioMetrics({ trades: [], equityPoints, initialCapital: 100_000_000 });
    expect(metrics.avgCapitalDeployedPct).toBeNull();

    const withDeployed = computePortfolioMetrics({
      trades: [],
      equityPoints,
      initialCapital: 100_000_000,
      capitalDeployedRatioByDate: [
        { date: "2026-01-01", ratio: 0.2 },
        { date: "2026-01-10", ratio: 0.4 },
      ],
    });
    expect(withDeployed.avgCapitalDeployedPct).toBeCloseTo(30, 10);
  });

  it("دورهٔ به‌اندازه کافی بلند، Sharpe واقعی می‌دهد", () => {
    const long = Array.from({ length: 120 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
      equity: 100_000_000 * (1 + i * 0.001),
    }));
    const metrics = computePortfolioMetrics({ trades: [], equityPoints: long, initialCapital: 100_000_000 });
    expect(metrics.sharpe).not.toBeNull();
  });
});

describe("مقایسهٔ کل پرتفوی با بنچمارک‌ها", () => {
  it("هر سه بنچمارک ردیف دارند، حتی وقتی داده‌شان نیست", () => {
    const rows = comparePortfolioToBenchmarks(8, "2026-01-01", "2026-01-10", { tedpix: TEDPIX }, null);
    expect(rows).toHaveLength(3);
    expect(rows[0].excessPct).toBeCloseTo(-12, 10);
    expect(rows[1].benchmarkReturnPct).toBeNull(); // هم‌وزن داده نداشت
    expect(rows[1].excessPct).toBeNull();
    expect(rows[2].label).toContain("Buy & Hold");
  });
});
