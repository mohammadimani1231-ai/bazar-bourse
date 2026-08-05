import { describe, expect, it } from "vitest";
import {
  isMarketOpen,
  isStaleAsOf,
  isWithinTheoreticalTradingWindow,
  wasTodayTradingDay,
  type VolumeSample,
} from "./market-status.ts";

// ۲۰۲۶-۰۸-۰۳ دوشنبه بود (تأییدشده در گفتگو) → ۰۸-۰۴ سه‌شنبه، ۰۸-۰۶ پنجشنبه (غیرمعاملاتی)
const TUESDAY_IN_WINDOW = new Date("2026-08-04T07:00:00.000Z");
const TUESDAY_AFTER_CLOSE = new Date("2026-08-04T10:00:00.000Z");
const THURSDAY_IN_HOURS = new Date("2026-08-06T07:00:00.000Z");

describe("isWithinTheoreticalTradingWindow", () => {
  it("سه‌شنبه ساعت ۷ UTC داخل بازهٔ نظری است", () => {
    expect(isWithinTheoreticalTradingWindow(TUESDAY_IN_WINDOW)).toBe(true);
  });

  it("سه‌شنبه بعد از ۹:۳۰ UTC خارج از بازه است", () => {
    expect(isWithinTheoreticalTradingWindow(TUESDAY_AFTER_CLOSE)).toBe(false);
  });

  it("پنجشنبه حتی در ساعت مشابه، معاملاتی نیست", () => {
    expect(isWithinTheoreticalTradingWindow(THURSDAY_IN_HOURS)).toBe(false);
  });
});

describe("isMarketOpen", () => {
  it("خارج از بازهٔ نظری → بسته با دلیل outside_theoretical_hours", () => {
    const result = isMarketOpen({ nowUtc: TUESDAY_AFTER_CLOSE, holidayDates: new Set(), recentVolumes: [] });
    expect(result.open).toBe(false);
    if (!result.open) expect(result.reason).toBe("outside_theoretical_hours");
  });

  it("داخل بازه ولی روز تعطیل رسمی (جدول market_holidays) → بسته با دلیل holiday", () => {
    const result = isMarketOpen({
      nowUtc: TUESDAY_IN_WINDOW,
      holidayDates: new Set(["2026-08-04"]),
      recentVolumes: [],
    });
    expect(result.open).toBe(false);
    if (!result.open) expect(result.reason).toBe("holiday");
  });

  it("داخل بازه، بدون تعطیلی، حجم اخیر تغییر کرده → باز", () => {
    const recentVolumes: VolumeSample[] = [
      { capturedAt: "2026-08-04T06:40:00.000Z", volume: 1000 },
      { capturedAt: "2026-08-04T07:00:00.000Z", volume: 1500 },
    ];
    const result = isMarketOpen({ nowUtc: TUESDAY_IN_WINDOW, holidayDates: new Set(), recentVolumes });
    expect(result.open).toBe(true);
  });

  it("داخل بازه، ولی حجم نماد پرمعامله ۱۵+ دقیقه بدون تغییر مانده → بسته (تعطیلی نامنظم/اعلامی)", () => {
    const recentVolumes: VolumeSample[] = [
      { capturedAt: "2026-08-04T06:40:00.000Z", volume: 1000 },
      { capturedAt: "2026-08-04T07:00:00.000Z", volume: 1000 },
    ];
    const result = isMarketOpen({ nowUtc: TUESDAY_IN_WINDOW, holidayDates: new Set(), recentVolumes });
    expect(result.open).toBe(false);
    if (!result.open) expect(result.reason).toBe("no_volume_change");
  });

  it("با کمتر از ۲ نمونهٔ حجم (نماد تازه/بدون تاریخچه)، heuristic رد می‌شود و بازار باز فرض می‌شود", () => {
    const result = isMarketOpen({ nowUtc: TUESDAY_IN_WINDOW, holidayDates: new Set(), recentVolumes: [] });
    expect(result.open).toBe(true);
  });

  it("اگر نمونهٔ قدیمی‌تر از ۱۵ دقیقه موجود نباشد (بازار تازه باز شده)، heuristic رد می‌شود", () => {
    const recentVolumes: VolumeSample[] = [{ capturedAt: "2026-08-04T06:58:00.000Z", volume: 1000 }];
    const result = isMarketOpen({ nowUtc: TUESDAY_IN_WINDOW, holidayDates: new Set(), recentVolumes });
    expect(result.open).toBe(true);
  });
});

describe("wasTodayTradingDay", () => {
  it("سه‌شنبهٔ بدون تعطیلی، حتی بعد از پایان ساعات بازار → روز معاملاتی بوده", () => {
    expect(wasTodayTradingDay(TUESDAY_AFTER_CLOSE, new Set())).toBe(true);
  });

  it("پنجشنبه هرگز روز معاملاتی نیست، صرف‌نظر از تعطیلات", () => {
    expect(wasTodayTradingDay(THURSDAY_IN_HOURS, new Set())).toBe(false);
  });

  it("سه‌شنبه‌ای که در جدول تعطیلات ثبت شده → روز معاملاتی نبوده", () => {
    expect(wasTodayTradingDay(TUESDAY_AFTER_CLOSE, new Set(["2026-08-04"]))).toBe(false);
  });

  it("تعطیلی اعلامی/نامنظم که در جدول نیست ولی حجم کل روز بدون تغییر مانده → روز معاملاتی نبوده", () => {
    const todayVolumes: VolumeSample[] = [
      { capturedAt: "2026-08-04T05:35:00.000Z", volume: 5000 },
      { capturedAt: "2026-08-04T07:00:00.000Z", volume: 5000 },
      { capturedAt: "2026-08-04T09:00:00.000Z", volume: 5000 },
    ];
    expect(wasTodayTradingDay(TUESDAY_AFTER_CLOSE, new Set(), todayVolumes)).toBe(false);
  });

  it("حجم واقعاً در طول روز تغییر کرده → روز معاملاتی بوده", () => {
    const todayVolumes: VolumeSample[] = [
      { capturedAt: "2026-08-04T05:35:00.000Z", volume: 5000 },
      { capturedAt: "2026-08-04T09:00:00.000Z", volume: 9000 },
    ];
    expect(wasTodayTradingDay(TUESDAY_AFTER_CLOSE, new Set(), todayVolumes)).toBe(true);
  });
});

describe("isStaleAsOf", () => {
  const NOW_MS = new Date("2026-08-04T07:30:00.000Z").getTime();

  it("بازار بسته باشد → هرگز stale نیست، حتی دادهٔ خیلی قدیمی", () => {
    expect(isStaleAsOf("2026-08-01T00:00:00.000Z", false, NOW_MS)).toBe(false);
  });

  it("بازار باز، دادهٔ زیر ۱۵ دقیقه → stale نیست", () => {
    expect(isStaleAsOf("2026-08-04T07:20:00.000Z", true, NOW_MS)).toBe(false);
  });

  it("بازار باز، دادهٔ بیش از ۱۵ دقیقه → stale است", () => {
    expect(isStaleAsOf("2026-08-04T07:10:00.000Z", true, NOW_MS)).toBe(true);
  });

  it("آستانهٔ سفارشی رعایت می‌شود", () => {
    expect(isStaleAsOf("2026-08-04T07:25:00.000Z", true, NOW_MS, 2 * 60 * 1000)).toBe(true);
  });
});
