import { describe, expect, it } from "vitest";
import { parseWeeklySummaryResponse } from "./weeklyBriefSchema.ts";

const VALID = {
  summary: "بازار این هفته با ورود پول به فلزات اساسی و افت جزئی شاخص هم‌وزن همراه بود.",
  key_points: [
    { point: "فلزات اساسی بیشترین ورود پول حقیقی هفته را داشت", confidence: "قطعی از داده", ref: "market.top_industries_by_money_flow" },
  ],
};

describe("parseWeeklySummaryResponse", () => {
  it("خروجی معتبر پارس می‌شود", () => {
    const result = parseWeeklySummaryResponse(JSON.stringify(VALID));
    expect(result.success).toBe(true);
  });

  it("key_points خالی هم معتبر است", () => {
    const result = parseWeeklySummaryResponse(JSON.stringify({ ...VALID, key_points: [] }));
    expect(result.success).toBe(true);
  });

  it("confidence نامعتبر رد می‌شود", () => {
    const invalid = { ...VALID, key_points: [{ ...VALID.key_points[0], confidence: "خیلی مطمئن" }] };
    const result = parseWeeklySummaryResponse(JSON.stringify(invalid));
    expect(result.success).toBe(false);
  });

  it("JSON نامعتبر خطای واضح می‌دهد", () => {
    const result = parseWeeklySummaryResponse("not json");
    expect(result.success).toBe(false);
  });
});
