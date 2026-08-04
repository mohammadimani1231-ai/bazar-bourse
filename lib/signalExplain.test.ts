import { describe, expect, it } from "vitest";
import { explainSignalFactors } from "./signalExplain.ts";

describe("explainSignalFactors", () => {
  it("فقط قوانین trigger‌شده را توضیح می‌دهد", () => {
    const result = explainSignalFactors([
      { rule: "ema_cross_up", triggered: true, contribution: 25 },
      { rule: "rsi_oversold", triggered: false, contribution: 0 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("کراس صعودی");
  });

  it("قانون ناشناخته هم به یک جملهٔ generic تبدیل می‌شود، نه حذف می‌شود", () => {
    const result = explainSignalFactors([{ rule: "unknown_rule_xyz", triggered: true }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("unknown_rule_xyz");
  });

  it("آرایهٔ خالی → آرایهٔ خالی", () => {
    expect(explainSignalFactors([])).toEqual([]);
  });

  it("همهٔ قوانین شناخته‌شدهٔ فعلی template دارند", () => {
    const rules = [
      "rsi_oversold", "rsi_overbought", "ema_cross_up", "ema_cross_down",
      "suspicious_volume", "buyer_power_strong", "money_inflow_3d",
      "near_52w_high", "near_52w_low", "composite_rank_strong",
    ];
    const result = explainSignalFactors(rules.map((rule) => ({ rule, triggered: true })));
    for (const text of result) {
      expect(text.startsWith("قانون «")).toBe(false);
    }
  });
});
