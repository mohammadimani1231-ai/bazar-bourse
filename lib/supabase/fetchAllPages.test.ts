import { describe, expect, it } from "vitest";
import { fetchAllPages } from "./fetchAllPages.ts";

describe("fetchAllPages", () => {
  it("یک صفحهٔ کمتر از سقف را بدون کوئری دوم برمی‌گرداند", async () => {
    let calls = 0;
    const rows = await fetchAllPages<number>(async () => {
      calls++;
      return [1, 2, 3];
    });
    expect(rows).toEqual([1, 2, 3]);
    expect(calls).toBe(1);
  });

  it("وقتی یک صفحه دقیقاً به سقف ۱۰۰۰ می‌رسد، صفحهٔ بعدی را هم می‌گیرد", async () => {
    let calls = 0;
    const rows = await fetchAllPages<number>(async (from) => {
      calls++;
      if (from === 0) return Array.from({ length: 1000 }, (_, i) => i);
      return [1000, 1001];
    });
    expect(rows.length).toBe(1002);
    expect(calls).toBe(2);
  });

  it("نتیجهٔ خالی را بدون خطا برمی‌گرداند", async () => {
    const rows = await fetchAllPages<number>(async () => []);
    expect(rows).toEqual([]);
  });

  it("from/to صحیح را به fetchPage پاس می‌دهد", async () => {
    const ranges: [number, number][] = [];
    await fetchAllPages<number>(async (from, to) => {
      ranges.push([from, to]);
      if (from === 0) return Array.from({ length: 1000 }, (_, i) => i);
      return [];
    });
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
});
