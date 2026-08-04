import { describe, expect, it } from "vitest";
import { computeRuleStats } from "./ruleStats.ts";

describe("computeRuleStats", () => {
  it("بازده را فقط به قوانین trigger‌شده نسبت می‌دهد", () => {
    const stats = computeRuleStats([
      {
        returnPct: 5,
        reasons: [
          { rule: "ema_cross_up", triggered: true },
          { rule: "rsi_oversold", triggered: false },
        ],
      },
      {
        returnPct: -2,
        reasons: [
          { rule: "ema_cross_up", triggered: true },
          { rule: "rsi_oversold", triggered: true },
        ],
      },
    ]);

    const emaStat = stats.find((s) => s.rule === "ema_cross_up")!;
    const rsiStat = stats.find((s) => s.rule === "rsi_oversold")!;
    expect(emaStat.count).toBe(2);
    expect(rsiStat.count).toBe(1);
  });

  it("winRate و profitFactor درست محاسبه می‌شوند", () => {
    const stats = computeRuleStats([
      { returnPct: 10, reasons: [{ rule: "r", triggered: true }] },
      { returnPct: 10, reasons: [{ rule: "r", triggered: true }] },
      { returnPct: -5, reasons: [{ rule: "r", triggered: true }] },
    ]);
    const r = stats[0];
    expect(r.count).toBe(3);
    expect(r.winRate).toBeCloseTo((2 / 3) * 100, 10);
    expect(r.profitFactor).toBeCloseTo(20 / 5, 10);
  });

  it("evaluation بدون returnPct نادیده گرفته می‌شود", () => {
    const stats = computeRuleStats([
      { returnPct: null, reasons: [{ rule: "r", triggered: true }] },
    ]);
    expect(stats).toEqual([]);
  });

  it("grossLoss صفر → profitFactor null (نه Infinity)", () => {
    const stats = computeRuleStats([
      { returnPct: 5, reasons: [{ rule: "r", triggered: true }] },
    ]);
    expect(stats[0].profitFactor).toBeNull();
  });
});
