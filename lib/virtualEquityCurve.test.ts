import { describe, expect, it } from "vitest";
import { buildVirtualEquityCurve, type EquityCurveTrade } from "./virtualEquityCurve.ts";

const CALENDAR = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"];

function closes(map: Record<string, Record<string, number>>): Map<string, Map<string, number>> {
  return new Map(Object.entries(map).map(([symbol, byDate]) => [symbol, new Map(Object.entries(byDate))]));
}

const OPEN_TRADE: EquityCurveTrade = {
  symbol: "فملی",
  entryDate: "2026-01-02",
  entryPrice: 1000,
  shareCount: 100,
  entryFee: 370,
  exitDate: null,
  exitPrice: null,
  exitFee: null,
};

describe("منحنی سرمایهٔ مارک‌تومارکت", () => {
  it("قبل از اولین ورود، سرمایه دقیقاً همان سرمایهٔ اولیه است", () => {
    const { points } = buildVirtualEquityCurve([OPEN_TRADE], 1_000_000, CALENDAR, closes({ فملی: {} }));
    expect(points[0].equity).toBe(1_000_000);
  });

  it("پوزیشن باز با قیمت بستهٔ همان روز ارزش‌گذاری می‌شود (نه قیمت ورود)", () => {
    const { points } = buildVirtualEquityCurve(
      [OPEN_TRADE],
      1_000_000,
      CALENDAR,
      closes({ فملی: { "2026-01-02": 1000, "2026-01-03": 1200, "2026-01-04": 900 } }),
    );
    // روز ورود: نقد ۱٬۰۰۰٬۰۰۰ − ۱۰۰٬۰۰۰ − ۳۷۰ + ارزش ۱۰۰٬۰۰۰ = ۹۹۹٬۶۳۰ (فقط کارمزد کم شده)
    expect(points[1].equity).toBeCloseTo(999_630, 6);
    // سود شناور روز بعد: ارزش ۱۲۰٬۰۰۰
    expect(points[2].equity).toBeCloseTo(1_019_630, 6);
    // زیان شناور
    expect(points[3].equity).toBeCloseTo(989_630, 6);
  });

  it("پوزیشن بسته‌شده بعد از تاریخ خروج دیگر ارزش‌گذاری نمی‌شود", () => {
    const closed: EquityCurveTrade = { ...OPEN_TRADE, exitDate: "2026-01-03", exitPrice: 1200, exitFee: 1656 };
    const { points, capitalDeployedRatioByDate } = buildVirtualEquityCurve(
      [closed],
      1_000_000,
      CALENDAR,
      closes({ فملی: { "2026-01-02": 1000, "2026-01-03": 1200, "2026-01-04": 900 } }),
    );
    // بعد از خروج: ۱٬۰۰۰٬۰۰۰ − ۱۰۰٬۳۷۰ + ۱۲۰٬۰۰۰ − ۱٬۶۵۶
    expect(points[2].equity).toBeCloseTo(1_017_974, 6);
    // افت قیمت روز بعد دیگر اثری ندارد چون پوزیشن بسته شده
    expect(points[3].equity).toBeCloseTo(1_017_974, 6);
    expect(capitalDeployedRatioByDate[3].ratio).toBe(0);
  });

  it("٪ سرمایهٔ درگیر در روز نگه‌داری واقعی محاسبه می‌شود", () => {
    const { capitalDeployedRatioByDate } = buildVirtualEquityCurve(
      [OPEN_TRADE],
      1_000_000,
      CALENDAR,
      closes({ فملی: { "2026-01-02": 1000 } }),
    );
    expect(capitalDeployedRatioByDate[0].ratio).toBe(0);
    expect(capitalDeployedRatioByDate[1].ratio).toBeCloseTo(100_000 / 999_630, 6);
  });

  it("نبود کندل در یک روز (توقف نماد) کرش نمی‌کند و از قیمت ورود استفاده می‌کند", () => {
    const { points } = buildVirtualEquityCurve([OPEN_TRADE], 1_000_000, CALENDAR, closes({ فملی: {} }));
    expect(points[3].equity).toBeCloseTo(999_630, 6);
  });
});
