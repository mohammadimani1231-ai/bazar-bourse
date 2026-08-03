import { describe, expect, it } from "vitest";
import { tehranDayBounds } from "./tehranDay.ts";

describe("tehranDayBounds", () => {
  it("۰۰:۰۰ تهران (=۲۰:۳۰ UTC روز قبل) را به همان روز تقویمی تهران نگاشت می‌کند", () => {
    // 2026-08-03 00:00 تهران = 2026-08-02 20:30 UTC
    const bounds = tehranDayBounds(new Date("2026-08-02T20:30:00.000Z"));
    expect(bounds.date).toBe("2026-08-03");
    expect(bounds.startUtc).toBe("2026-08-02T20:30:00.000Z");
    expect(bounds.endUtc).toBe("2026-08-03T20:30:00.000Z");
  });

  it("لحظه‌ای در وسط ساعات بازار تهران را به روز درست نگاشت می‌کند", () => {
    // 2026-08-03 09:00 تهران = 2026-08-03 05:30 UTC
    const bounds = tehranDayBounds(new Date("2026-08-03T05:30:00.000Z"));
    expect(bounds.date).toBe("2026-08-03");
  });

  it("درست قبل از نیمه‌شب تهران هنوز روز قبل حساب می‌شود", () => {
    // 2026-08-02 23:59 تهران = 2026-08-02 20:29 UTC
    const bounds = tehranDayBounds(new Date("2026-08-02T20:29:00.000Z"));
    expect(bounds.date).toBe("2026-08-02");
  });
});
