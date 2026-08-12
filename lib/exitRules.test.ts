import { describe, expect, it } from "vitest";
import { decideExit, isMaxHoldReached, isStopLossHit } from "./exitRules.ts";

describe("exitRules", () => {
  it("سقف مدت نگه‌داری دقیقاً در روز N فعال می‌شود (هم‌ساز با شرط موجود بک‌تست)", () => {
    expect(isMaxHoldReached(19, 20)).toBe(false);
    expect(isMaxHoldReached(20, 20)).toBe(true);
  });

  it("حد ضرر با قیمت مساوی هم فعال می‌شود", () => {
    expect(isStopLossHit(950, 950)).toBe(true);
    expect(isStopLossHit(951, 950)).toBe(false);
  });

  it("نبود حد ضرر یا قیمت، هرگز خروج نمی‌سازد", () => {
    expect(isStopLossHit(null, 950)).toBe(false);
    expect(isStopLossHit(900, null)).toBe(false);
  });

  it("اولویت: حد ضرر بر سیگنال فروش و سقف نگه‌داری مقدم است", () => {
    expect(
      decideExit({ hasSellSignal: true, heldDays: 30, maxHoldDays: 20, currentPrice: 900, stopLossPrice: 950 }),
    ).toBe("stop_loss");
  });

  it("اولویت: سیگنال فروش بر سقف نگه‌داری مقدم است", () => {
    expect(
      decideExit({ hasSellSignal: true, heldDays: 30, maxHoldDays: 20, currentPrice: 1100, stopLossPrice: 950 }),
    ).toBe("sell_signal");
  });

  it("بدون هیچ شرطی، خروجی null است (پوزیشن باز می‌ماند)", () => {
    expect(
      decideExit({ hasSellSignal: false, heldDays: 5, maxHoldDays: 20, currentPrice: 1100, stopLossPrice: 950 }),
    ).toBeNull();
  });

  it("رفتار بک‌تست (بدون حد ضرر) با stopLossPrice=null دست‌نخورده می‌ماند", () => {
    expect(
      decideExit({ hasSellSignal: false, heldDays: 20, maxHoldDays: 20, currentPrice: 100, stopLossPrice: null }),
    ).toBe("max_hold");
  });
});
