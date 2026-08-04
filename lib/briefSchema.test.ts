import { describe, expect, it } from "vitest";
import { parseBriefResponse } from "./briefSchema.ts";

// نمونهٔ دستی‌ساخته دقیقاً مطابق فرمت خروجی system prompt فاز ۶ (نه واقعی از Claude — چون
// اعتبار API هنوز فعال نشده؛ این تست فقط منطق پارس/اعتبارسنجی zod را چک می‌کند).
const VALID_BRIEF = {
  market_mood: "خنثی",
  summary: "بازار امروز بدون جهت‌گیری واضح باز می‌شود. نفت برنت افزایش جزئی داشته که می‌تواند به پالایشی‌ها کمک کند. شاخص تنش در محدودهٔ عادی است.",
  sector_notes: [
    { sector: "پالایشی", view: "افزایش برنت می‌تواند حاشیهٔ سود را بهبود دهد", confidence: "استنتاج قوی", ref: "global.brent" },
  ],
  signal_review: [
    { symbol: "فملی", verdict: "هم‌راستا", note: "سیگنال خرید با روند فلزات هم‌جهت است", ref: "signals[0]" },
  ],
  main_risk: "نوسان نرخ ارز آزاد می‌تواند جهت بازار را عوض کند.",
};

describe("parseBriefResponse", () => {
  it("خروجی معتبر مطابق فرمت prompt پارس می‌شود", () => {
    const result = parseBriefResponse(JSON.stringify(VALID_BRIEF));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.market_mood).toBe("خنثی");
      expect(result.data.sector_notes[0].confidence).toBe("استنتاج قوی");
    }
  });

  it("confidence با کروشه هم پذیرفته می‌شود (طبق نگارش قاعدهٔ سخت prompt)", () => {
    const withBrackets = {
      ...VALID_BRIEF,
      sector_notes: [{ ...VALID_BRIEF.sector_notes[0], confidence: "[استنتاج قوی]" }],
    };
    const result = parseBriefResponse(JSON.stringify(withBrackets));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sector_notes[0].confidence).toBe("استنتاج قوی");
  });

  it("JSON غیرمعتبر خطای پارس واضح می‌دهد", () => {
    const result = parseBriefResponse("{ این جیسون نیست");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("JSON parse failed");
  });

  it("market_mood خارج از enum رد می‌شود", () => {
    const invalid = { ...VALID_BRIEF, market_mood: "خیلی مثبت" };
    const result = parseBriefResponse(JSON.stringify(invalid));
    expect(result.success).toBe(false);
  });

  it("فیلد اجباری غایب (main_risk) رد می‌شود", () => {
    const invalid: Record<string, unknown> = { ...VALID_BRIEF };
    delete invalid.main_risk;
    const result = parseBriefResponse(JSON.stringify(invalid));
    expect(result.success).toBe(false);
  });

  it("sector_notes/signal_review خالی هم معتبر است (روز بدون سیگنال فعال)", () => {
    const empty = { ...VALID_BRIEF, sector_notes: [], signal_review: [] };
    const result = parseBriefResponse(JSON.stringify(empty));
    expect(result.success).toBe(true);
  });

  it("verdict خارج از enum رد می‌شود", () => {
    const invalid = {
      ...VALID_BRIEF,
      signal_review: [{ ...VALID_BRIEF.signal_review[0], verdict: "نامشخص" }],
    };
    const result = parseBriefResponse(JSON.stringify(invalid));
    expect(result.success).toBe(false);
  });
});
