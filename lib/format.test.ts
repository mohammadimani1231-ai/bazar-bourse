import { describe, expect, it } from "vitest";
import { formatFaNumber, formatFaPercent, formatFaCompactRial, toToman } from "./format.ts";

describe("formatFaNumber", () => {
  it("جداکنندهٔ هزارگان و ارقام فارسی", () => {
    expect(formatFaNumber(1234567)).toBe("۱٬۲۳۴٬۵۶۷");
    expect(formatFaNumber(0)).toBe("۰");
  });

  it("null/undefined/NaN می‌شود خط تیره", () => {
    expect(formatFaNumber(null)).toBe("—");
    expect(formatFaNumber(undefined)).toBe("—");
    expect(formatFaNumber(NaN)).toBe("—");
  });
});

describe("formatFaPercent", () => {
  it("مثبت با علامت + جلوش می‌آید", () => {
    expect(formatFaPercent(2.3)).toBe("+۲٫۳٪");
  });

  it("منفی علامت منفی خودش را دارد (بدون + اضافه)", () => {
    expect(formatFaPercent(-2.3)).toContain("۲٫۳٪");
    expect(formatFaPercent(-2.3).startsWith("+")).toBe(false);
  });

  it("صفر بدون علامت", () => {
    expect(formatFaPercent(0)).toBe("۰٫۰٪");
  });
});

describe("formatFaCompactRial", () => {
  it("همت برای اعداد تریلیونی", () => {
    expect(formatFaCompactRial(1_500_000_000_000)).toBe("۱٫۵ همت");
  });

  it("میلیارد", () => {
    expect(formatFaCompactRial(123_400_000_000)).toBe("۱۲۳٫۴ میلیارد");
  });

  it("میلیون", () => {
    expect(formatFaCompactRial(560_000_000)).toBe("۵۶۰ میلیون");
  });

  it("زیر یک میلیون بدون واحد", () => {
    expect(formatFaCompactRial(1200)).toBe("۱٬۲۰۰");
  });
});

describe("toToman", () => {
  it("ریال را ÷۱۰ می‌کند", () => {
    expect(toToman(1_862_000)).toBe(186_200);
  });

  it("null/undefined/NaN را دست‌نخورده رد می‌کند", () => {
    expect(toToman(null)).toBeNull();
    expect(toToman(undefined)).toBeNull();
    expect(toToman(NaN)).toBeNull();
  });
});
