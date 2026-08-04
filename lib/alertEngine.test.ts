import { describe, expect, it } from "vitest";
import { tensionConditionMet, isCooldownElapsed } from "./alertEngine.ts";

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
