import { describe, expect, it } from "vitest";
import { tradingDaysBetween } from "./tradingDays.ts";

describe("tradingDaysBetween", () => {
  it("یک هفتهٔ کامل = ۵ روز معاملاتی", () => {
    expect(tradingDaysBetween("2026-08-01T06:00:00Z", "2026-08-08T06:00:00Z")).toBe(5);
  });

  it("چهار هفته = ۲۰ روز معاملاتی (دقیقاً مرز سقف نگه‌داری)", () => {
    expect(tradingDaysBetween("2026-08-01T06:00:00Z", "2026-08-29T06:00:00Z")).toBe(20);
  });

  it("همان روز و زمان‌های معکوس، صفر می‌دهد", () => {
    expect(tradingDaysBetween("2026-08-01T06:00:00Z", "2026-08-01T12:00:00Z")).toBe(0);
    expect(tradingDaysBetween("2026-08-08T06:00:00Z", "2026-08-01T06:00:00Z")).toBe(0);
  });
});
