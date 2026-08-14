import { describe, expect, it } from "vitest";
import { distanceFromHigh } from "./priceExtremes.ts";

describe("distanceFromHigh", () => {
  it("قیمت فعلی زیر سقف بازه → درصد منفی", () => {
    const closes = [100, 110, 120, 90, 80];
    const result = distanceFromHigh(96, closes, 5);
    expect(result.high).toBe(120);
    expect(result.distancePct).toBeCloseTo(-20, 6);
  });

  it("قیمت فعلی دقیقاً روی سقف → صفر", () => {
    const closes = [100, 110, 120];
    const result = distanceFromHigh(120, closes, 3);
    expect(result.distancePct).toBeCloseTo(0, 6);
  });

  it("قیمت فعلی بالای هر سقف تاریخی (رکورد جدید) → مثبت", () => {
    const closes = [100, 110, 120];
    const result = distanceFromHigh(150, closes, 3);
    expect(result.distancePct).toBeCloseTo(25, 6);
  });

  it("فقط windowDays تای آخر در نظر گرفته می‌شود، نه کل آرایه", () => {
    const closes = [500, 100, 110, 120]; // ۵۰۰ خارج از پنجرهٔ ۳تایی آخر است
    const result = distanceFromHigh(115, closes, 3);
    expect(result.high).toBe(120);
  });

  it("داده ناکافی/قیمت فعلی null → نتیجهٔ null، نه خطا", () => {
    expect(distanceFromHigh(null, [100, 110], 5)).toEqual({ high: null, distancePct: null });
    expect(distanceFromHigh(100, [], 5)).toEqual({ high: null, distancePct: null });
  });
});
