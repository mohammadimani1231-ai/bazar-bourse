import { describe, expect, it } from "vitest";
import {
  averageLoss,
  averageWin,
  bestTrade,
  equityReturns,
  expectancy,
  grossProfitLoss,
  maxDrawdown,
  profitFactor,
  sharpeRatio,
  sortinoRatio,
  splitWinsLosses,
  winRatePct,
  worstTrade,
} from "./tradeMetrics.ts";

const TRADES = [{ pnl: 100 }, { pnl: -50 }, { pnl: 200 }, { pnl: -150 }];

describe("قراردادهای منتقل‌شده از بک‌تست (تغییرشان یعنی تغییر همهٔ اعداد تاریخی)", () => {
  it("معاملهٔ با pnl دقیقاً صفر جزو زیان‌ها شمرده می‌شود، نه برد", () => {
    const { wins, losses } = splitWinsLosses([{ pnl: 0 }, { pnl: 1 }]);
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
    expect(winRatePct([{ pnl: 0 }, { pnl: 1 }])).toBe(50);
  });

  it("profit factor بدون زیان و با سود Infinity است", () => {
    expect(profitFactor([{ pnl: 10 }, { pnl: 5 }])).toBe(Infinity);
  });

  it("profit factor روی لیست خالی یا کاملاً صفر، صفر است", () => {
    expect(profitFactor([])).toBe(0);
    expect(profitFactor([{ pnl: 0 }])).toBe(0);
  });
});

describe("متریک‌های پایه", () => {
  it("سود/زیان ناخالص", () => {
    const { grossProfit, grossLoss } = grossProfitLoss(TRADES);
    expect(grossProfit).toBe(300);
    expect(grossLoss).toBe(200);
  });

  it("profit factor و expectancy", () => {
    expect(profitFactor(TRADES)).toBeCloseTo(1.5, 10);
    expect(expectancy(TRADES)).toBe(25);
  });

  it("میانگین برد و باخت", () => {
    expect(averageWin(TRADES)).toBe(150);
    expect(averageLoss(TRADES)).toBe(-100);
    expect(averageWin([{ pnl: -1 }])).toBeNull();
    expect(averageLoss([{ pnl: 1 }])).toBeNull();
  });

  it("بهترین و بدترین معامله", () => {
    expect(bestTrade(TRADES)?.pnl).toBe(200);
    expect(worstTrade(TRADES)?.pnl).toBe(-150);
    expect(bestTrade([])).toBeNull();
  });

  it("لیست خالی همه‌جا صفر می‌دهد، نه NaN", () => {
    expect(winRatePct([])).toBe(0);
    expect(expectancy([])).toBe(0);
  });
});

describe("منحنی سرمایه", () => {
  const POINTS = [
    { date: "2026-01-01", equity: 100 },
    { date: "2026-01-02", equity: 110 },
    { date: "2026-01-03", equity: 88 },
    { date: "2026-01-04", equity: 99 },
  ];

  it("بازده‌های دوره‌به‌دوره", () => {
    const r = equityReturns(POINTS);
    expect(r).toHaveLength(3);
    expect(r[0]).toBeCloseTo(0.1, 10);
    expect(r[1]).toBeCloseTo(-0.2, 10);
  });

  it("عمیق‌ترین افت از سقف قبلی محاسبه می‌شود، نه از ابتدا", () => {
    const { maxDrawdownPct, troughDate } = maxDrawdown(POINTS);
    expect(maxDrawdownPct).toBeCloseTo(-20, 10); // از سقف ۱۱۰ به ۸۸
    expect(troughDate).toBe("2026-01-03");
  });

  it("منحنی صعودی خالص هیچ افتی ندارد", () => {
    expect(
      maxDrawdown([
        { date: "a", equity: 1 },
        { date: "b", equity: 2 },
      ]).maxDrawdownPct,
    ).toBe(0);
  });

  it("Sharpe و Sortino روی نوسان صفر، صفر می‌دهند نه بی‌نهایت", () => {
    expect(sharpeRatio([0.01, 0.01, 0.01])).toBe(0);
    expect(sortinoRatio([0.01, 0.01])).toBe(0);
  });

  it("Sortino فقط نوسان منفی را جریمه می‌کند، پس از Sharpe بزرگ‌تر است", () => {
    const returns = [0.05, -0.01, 0.04, -0.01, 0.06];
    expect(sortinoRatio(returns)).toBeGreaterThan(sharpeRatio(returns));
  });
});
