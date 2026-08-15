import { describe, expect, it } from "vitest";
import { ruleLabel } from "./signalExplain.ts";

describe("ruleLabel", () => {
  it("برای قانون شناخته‌شده همان جملهٔ توضیحی را می‌دهد", () => {
    expect(ruleLabel("ema_cross_up")).toContain("کراس صعودی");
  });

  it("برای قانون ناشناخته یک برچسب generic می‌دهد، نه throw", () => {
    expect(ruleLabel("unknown_rule_xyz")).toContain("unknown_rule_xyz");
  });

  it("همهٔ قوانین شناخته‌شدهٔ فعلی template دارند", () => {
    const rules = [
      "rsi_oversold", "rsi_overbought", "ema_cross_up", "ema_cross_down",
      "suspicious_volume", "buyer_power_strong", "money_inflow_3d",
      "near_52w_high", "near_52w_low", "composite_rank_strong",
    ];
    for (const rule of rules) {
      expect(ruleLabel(rule).startsWith("قانون «")).toBe(false);
    }
  });
});
