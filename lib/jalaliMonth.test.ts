import { describe, expect, it } from "vitest";
import { jalaliMonthOf, jalaliMonthName } from "./jalaliMonth.ts";

describe("jalaliMonthOf", () => {
  it("نوروز (اولین روز فروردین) → ماه ۱", () => {
    expect(jalaliMonthOf("2026-03-21")).toBe(1);
  });

  it("۲۰۲۶-۰۸-۰۴ → مرداد (۵)", () => {
    expect(jalaliMonthOf("2026-08-04")).toBe(5);
  });

  it("آخرین روز سال (اسفند) → ماه ۱۲", () => {
    expect(jalaliMonthOf("2026-03-20")).toBe(12);
  });

  it("۲۰۲۶-۰۱-۰۱ → دی (۱۰)", () => {
    expect(jalaliMonthOf("2026-01-01")).toBe(10);
  });
});

describe("jalaliMonthName", () => {
  it("نام ماه درست برمی‌گردد", () => {
    expect(jalaliMonthName(1)).toBe("فروردین");
    expect(jalaliMonthName(5)).toBe("مرداد");
    expect(jalaliMonthName(12)).toBe("اسفند");
  });
});
