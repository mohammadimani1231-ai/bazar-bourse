import { describe, expect, it } from "vitest";
import { resolveRefSection } from "./refResolver.ts";

const SNAPSHOT = {
  global: { برنت: { price: 85 } },
  signals: [{ symbol: "فملی", score: 55 }],
  market: { tedpix: 5277353 },
};

describe("resolveRefSection", () => {
  it("ref با dot-path بخش سطح‌بالا را برمی‌گرداند", () => {
    expect(resolveRefSection("global.برنت.price", SNAPSHOT)).toEqual({ برنت: { price: 85 } });
  });

  it("ref با bracket notation هم بخش سطح‌بالا را می‌دهد", () => {
    expect(resolveRefSection("signals[0].score", SNAPSHOT)).toEqual([{ symbol: "فملی", score: 55 }]);
  });

  it("بخش ناموجود → undefined", () => {
    expect(resolveRefSection("unknown_section.x", SNAPSHOT)).toBeUndefined();
  });

  it("ref بدون هیچ حرف لاتین در ابتدا → undefined", () => {
    expect(resolveRefSection("۱۲۳", SNAPSHOT)).toBeUndefined();
  });
});
