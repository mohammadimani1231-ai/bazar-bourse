import { describe, expect, it } from "vitest";
import { tensionConditionMet, isCooldownElapsed, mapActionRuleRow, type AlertRuleDbRow } from "./alertEngine.ts";

describe("tensionConditionMet", () => {
  it("مقدار null هرگز trigger نمی‌شود", () => {
    expect(tensionConditionMet({ op: ">=", value: 70 }, null)).toBe(false);
  });

  it("op های مختلف درست کار می‌کنند", () => {
    expect(tensionConditionMet({ op: ">=", value: 70 }, 70)).toBe(true);
    expect(tensionConditionMet({ op: ">=", value: 70 }, 69.9)).toBe(false);
    expect(tensionConditionMet({ op: "<", value: 30 }, 20)).toBe(true);
  });
});

describe("isCooldownElapsed", () => {
  it("قوانین غیر cooldown همیشه true می‌دهند", () => {
    expect(isCooldownElapsed({ firePolicy: "once", cooldownMinutes: null }, "2026-08-04T00:00:00Z", "2026-08-04T00:01:00Z")).toBe(true);
  });

  it("هیچ‌وقت شلیک نشده → true (اولین بار)", () => {
    expect(isCooldownElapsed({ firePolicy: "cooldown", cooldownMinutes: 60 }, null, "2026-08-04T00:00:00Z")).toBe(true);
  });

  it("هنوز داخل بازهٔ cooldown → false", () => {
    const result = isCooldownElapsed(
      { firePolicy: "cooldown", cooldownMinutes: 60 },
      "2026-08-04T00:00:00Z",
      "2026-08-04T00:30:00Z",
    );
    expect(result).toBe(false);
  });

  it("بعد از پایان cooldown → true", () => {
    const result = isCooldownElapsed(
      { firePolicy: "cooldown", cooldownMinutes: 60 },
      "2026-08-04T00:00:00Z",
      "2026-08-04T01:00:00Z",
    );
    expect(result).toBe(true);
  });
});

describe("mapActionRuleRow + isCooldownElapsed — رگرسیون باگ snake_case (کشف‌شده ۲۰۲۶-۰۸-۱۵)", () => {
  // شکل خام دقیقاً همان چیزی که evaluate-alerts/index.ts::fetchActionRules از Supabase
  // می‌گیرد (ستون‌های Postgres، snake_case) — قبل از رفع، این شکل مستقیم بدون map به
  // isCooldownElapsed پاس داده می‌شد و rule.firePolicy همیشه undefined بود.
  const tensionSpikeRow: AlertRuleDbRow = {
    id: 3,
    name: "tension_spike",
    condition: { type: "tension_index", op: ">=", value: 70 },
    severity: "action",
    fire_policy: "cooldown",
    cooldown_minutes: 240,
    enabled: true,
  };
  const pipelineDownRow: AlertRuleDbRow = {
    id: 4,
    name: "pipeline_down",
    condition: { type: "pipeline_health", status: "error" },
    severity: "action",
    fire_policy: "cooldown",
    cooldown_minutes: 60,
    enabled: true,
  };

  it("tension_spike (۲۴۰ دقیقه): ۱۰ دقیقه بعد از شلیک قبلی → هنوز داخل cooldown، false", () => {
    const rule = mapActionRuleRow(tensionSpikeRow);
    expect(rule.firePolicy).toBe("cooldown");
    expect(rule.cooldownMinutes).toBe(240);
    const result = isCooldownElapsed(rule, "2026-08-15T08:00:00Z", "2026-08-15T08:10:00Z");
    expect(result).toBe(false);
  });

  it("tension_spike (۲۴۰ دقیقه): بعد از ۲۴۰ دقیقهٔ کامل → true", () => {
    const rule = mapActionRuleRow(tensionSpikeRow);
    const result = isCooldownElapsed(rule, "2026-08-15T08:00:00Z", "2026-08-15T12:00:00Z");
    expect(result).toBe(true);
  });

  it("pipeline_down (۶۰ دقیقه): ۱۰ دقیقه بعد از شلیک قبلی → هنوز داخل cooldown، false", () => {
    const rule = mapActionRuleRow(pipelineDownRow);
    expect(rule.firePolicy).toBe("cooldown");
    expect(rule.cooldownMinutes).toBe(60);
    const result = isCooldownElapsed(rule, "2026-08-15T08:00:00Z", "2026-08-15T08:10:00Z");
    expect(result).toBe(false);
  });

  it("pipeline_down (۶۰ دقیقه): بعد از ۶۰ دقیقهٔ کامل → true", () => {
    const rule = mapActionRuleRow(pipelineDownRow);
    const result = isCooldownElapsed(rule, "2026-08-15T08:00:00Z", "2026-08-15T09:00:00Z");
    expect(result).toBe(true);
  });
});
