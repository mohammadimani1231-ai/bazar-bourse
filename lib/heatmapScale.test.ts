import { describe, expect, it } from "vitest";
import { heatmapStepVar } from "./heatmapScale.ts";

describe("heatmapStepVar", () => {
  it("خنثی: null/صفر/داخل ±۰.۵٪", () => {
    expect(heatmapStepVar(null)).toBe("var(--heat-0)");
    expect(heatmapStepVar(0)).toBe("var(--heat-0)");
    expect(heatmapStepVar(0.5)).toBe("var(--heat-0)");
    expect(heatmapStepVar(-0.5)).toBe("var(--heat-0)");
  });

  it("ضعیف: ۰.۵٪ تا ۲٪ → پلهٔ ۲", () => {
    expect(heatmapStepVar(0.51)).toBe("var(--heat-pos-2)");
    expect(heatmapStepVar(2)).toBe("var(--heat-pos-2)");
    expect(heatmapStepVar(-2)).toBe("var(--heat-neg-2)");
  });

  it("متوسط: ۲٪ تا ۴٪ → پلهٔ ۳", () => {
    expect(heatmapStepVar(2.01)).toBe("var(--heat-pos-3)");
    expect(heatmapStepVar(4)).toBe("var(--heat-pos-3)");
    expect(heatmapStepVar(-3.5)).toBe("var(--heat-neg-3)");
  });

  it("شدید: بالای ۴٪ → پلهٔ ۴", () => {
    expect(heatmapStepVar(4.01)).toBe("var(--heat-pos-4)");
    expect(heatmapStepVar(10)).toBe("var(--heat-pos-4)");
    expect(heatmapStepVar(-8)).toBe("var(--heat-neg-4)");
  });

  it("پلهٔ ۱ (heat-neg-1/heat-pos-1) با این مرزها هرگز انتخاب نمی‌شود", () => {
    for (let pct = -10; pct <= 10; pct += 0.1) {
      const result = heatmapStepVar(pct);
      expect(result).not.toContain("-1)");
    }
  });
});
