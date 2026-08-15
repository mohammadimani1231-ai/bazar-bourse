import { describe, expect, it } from "vitest";
import { findContinuityGap } from "./priceContinuity.ts";

describe("findContinuityGap", () => {
  it("وقفهٔ >۱۰ روزه همراه با جهش >۳۰٪ → گزارش می‌شود", () => {
    const closes = [
      { date: "2025-12-22", close: 85590 },
      { date: "2026-01-25", close: 28050 },
    ];
    const result = findContinuityGap(closes, "2025-08-15", "2026-08-15");
    expect(result).not.toBeNull();
    expect(result?.prevDate).toBe("2025-12-22");
    expect(result?.date).toBe("2026-01-25");
    expect(result?.gapDays).toBe(34);
    expect(result?.jumpPct).toBeCloseTo(-67.2, 1);
  });

  it("وقفهٔ کوتاه (تعطیلات آخر هفته) → گزارش نمی‌شود", () => {
    const closes = [
      { date: "2026-01-01", close: 1000 },
      { date: "2026-01-05", close: 500 }, // ۴ روز، حتی با جهش بزرگ
    ];
    expect(findContinuityGap(closes, "2025-08-15", "2026-08-15")).toBeNull();
  });

  it("وقفهٔ بلند بدون جهش قابل‌توجه → گزارش نمی‌شود", () => {
    const closes = [
      { date: "2026-01-01", close: 1000 },
      { date: "2026-02-01", close: 1050 }, // ۳۱ روز ولی فقط +۵٪
    ];
    expect(findContinuityGap(closes, "2025-08-15", "2026-08-15")).toBeNull();
  });

  it("خارج از بازهٔ [fromDate, toDate] در نظر گرفته نمی‌شود", () => {
    const closes = [
      { date: "2020-01-01", close: 85590 },
      { date: "2020-03-01", close: 28050 },
    ];
    expect(findContinuityGap(closes, "2025-08-15", "2026-08-15")).toBeNull();
  });

  it("ردیف‌های close=null نادیده گرفته می‌شوند", () => {
    const closes = [
      { date: "2025-12-22", close: 85590 },
      { date: "2026-01-24", close: null },
      { date: "2026-01-25", close: 28050 },
    ];
    const result = findContinuityGap(closes, "2025-08-15", "2026-08-15");
    expect(result?.prevDate).toBe("2025-12-22");
    expect(result?.date).toBe("2026-01-25");
  });
});
