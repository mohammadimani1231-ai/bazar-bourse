import { describe, expect, it } from "vitest";
import { renderBarChartSvg, renderLineChartSvg } from "./reportCharts.ts";

describe("renderBarChartSvg", () => {
  it("یک <rect> به ازای هر ردیف می‌سازد", () => {
    const svg = renderBarChartSvg([
      { label: "فلزات اساسی", value: 500 },
      { label: "خودرو", value: -200 },
    ]);
    expect((svg.match(/<rect/g) ?? []).length).toBe(2);
  });

  it("دادهٔ خالی SVG معتبر بدون کرش می‌دهد", () => {
    const svg = renderBarChartSvg([]);
    expect(svg).toContain("<svg");
    expect(svg).toContain("داده‌ای نیست");
  });

  it("کاراکترهای خاص در label را escape می‌کند", () => {
    const svg = renderBarChartSvg([{ label: "A & B <test>", value: 10 }]);
    expect(svg).toContain("A &amp; B &lt;test&gt;");
    expect(svg).not.toContain("A & B <test>");
  });

  it("valueFormatter سفارشی اعمال می‌شود", () => {
    const svg = renderBarChartSvg([{ label: "x", value: 1234 }], { valueFormatter: (v) => `${v}تومان` });
    expect(svg).toContain("1234تومان");
  });
});

describe("renderLineChartSvg", () => {
  it("یک <path> با نقاط کافی می‌سازد", () => {
    const svg = renderLineChartSvg([
      { x: "شنبه", y: 10 },
      { x: "یکشنبه", y: 20 },
      { x: "دوشنبه", y: 15 },
    ]);
    expect(svg).toContain("<path");
    expect(svg).toContain("شنبه");
    expect(svg).toContain("دوشنبه");
  });

  it("کمتر از ۲ نقطهٔ معتبر پیام «داده کافی نیست» می‌دهد، نه کرش", () => {
    const svg = renderLineChartSvg([{ x: "روز۱", y: 10 }]);
    expect(svg).toContain("داده‌ای کافی نیست");
  });

  it("مقادیر NaN/Infinity را قبل از رسم فیلتر می‌کند", () => {
    const svg = renderLineChartSvg([
      { x: "a", y: 1 },
      { x: "b", y: NaN },
      { x: "c", y: 2 },
    ]);
    expect(svg).toContain("<path");
  });
});
