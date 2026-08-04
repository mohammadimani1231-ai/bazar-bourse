import { describe, expect, it } from "vitest";
import { downsampleToDaily } from "./downsampleDaily.ts";

describe("downsampleToDaily", () => {
  it("چند رکورد یک روز تهران را به آخرین مقدار همان روز تقلیل می‌دهد", () => {
    // 2026-08-04T05:00Z و 09:00Z هر دو در همان روز تهران (+۳:۳۰) هستند
    const result = downsampleToDaily([
      { value: 100, captured_at: "2026-08-04T05:00:00Z" },
      { value: 110, captured_at: "2026-08-04T09:00:00Z" },
    ]);
    expect(result).toEqual([{ date: "2026-08-04", value: 110 }]);
  });

  it("مرز نیمه‌شب تهران را درست تشخیص می‌دهد", () => {
    // 2026-08-04T21:00Z = 2026-08-05T00:30 تهران → روز بعد
    const result = downsampleToDaily([
      { value: 100, captured_at: "2026-08-04T10:00:00Z" },
      { value: 200, captured_at: "2026-08-04T21:00:00Z" },
    ]);
    expect(result).toEqual([
      { date: "2026-08-04", value: 100 },
      { date: "2026-08-05", value: 200 },
    ]);
  });

  it("مقدار null نادیده گرفته می‌شود", () => {
    const result = downsampleToDaily([
      { value: null, captured_at: "2026-08-04T05:00:00Z" },
      { value: 50, captured_at: "2026-08-04T06:00:00Z" },
    ]);
    expect(result).toEqual([{ date: "2026-08-04", value: 50 }]);
  });

  it("خروجی بر اساس تاریخ صعودی مرتب است", () => {
    const result = downsampleToDaily([
      { value: 2, captured_at: "2026-08-05T05:00:00Z" },
      { value: 1, captured_at: "2026-08-04T05:00:00Z" },
    ]);
    expect(result.map((r) => r.date)).toEqual(["2026-08-04", "2026-08-05"]);
  });
});
