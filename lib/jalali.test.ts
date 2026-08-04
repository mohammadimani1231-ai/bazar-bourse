import { describe, expect, it } from "vitest";
import {
  formatJalaliDay,
  formatJalaliDateTime,
  formatTehranTime,
  formatJalaliLong,
} from "./jalali.ts";

describe("jalali", () => {
  it("تبدیل یک لحظهٔ UTC معمولی به تاریخ/ساعت شمسی تهران", () => {
    expect(formatJalaliDay("2026-08-04T20:35:00Z")).toBe("1405/05/14");
    expect(formatJalaliDateTime("2026-08-04T20:35:00Z")).toBe("1405/05/14 00:05");
    expect(formatTehranTime("2026-08-04T20:35:00Z")).toBe("00:05");
    expect(formatJalaliLong("2026-08-04T20:35:00Z")).toBe("14 مرداد 1405");
  });

  it("عبور از مرز سال شمسی (نوروز)", () => {
    expect(formatJalaliDay("2026-03-20T20:00:00Z")).toBe("1404/12/29");
  });

  it("عبور از مرز نیمه‌شب تهران به روز بعد", () => {
    expect(formatJalaliDay("2026-01-01T05:00:00Z")).toBe("1404/10/11");
  });

  it("ورودی Date object هم مثل رشتهٔ ISO کار می‌کند", () => {
    expect(formatJalaliDay(new Date("2026-08-04T20:35:00Z"))).toBe("1405/05/14");
  });
});
