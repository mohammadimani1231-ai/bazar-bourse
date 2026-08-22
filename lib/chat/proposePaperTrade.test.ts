import { describe, it, expect, vi, beforeEach } from "vitest";
import { proposePaperTrade } from "./proposePaperTrade";
import * as contextModule from "./context";

// Mock dependencies
vi.mock("./context", () => ({
  getPositionSizingContext: vi.fn(),
  getSignalDisclaimerText: vi.fn(() => "این پاسخ قطعیت نداره..."),
}));

describe("proposePaperTrade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return error for invalid symbol", async () => {
    const result = await proposePaperTrade("", 1000);
    expect(result.status).toBe("error");
    expect(result.error).toContain("نماد یا قیمت ورود نامعتبر");
  });

  it("should return error for invalid entry price", async () => {
    const result = await proposePaperTrade("خودرو", -100);
    expect(result.status).toBe("error");
    expect(result.error).toContain("نماد یا قیمت ورود نامعتبر");
  });

  it("should return error when context fetch fails", async () => {
    vi.mocked(contextModule.getPositionSizingContext).mockResolvedValueOnce(null);

    const result = await proposePaperTrade("خودرو", 1000);
    expect(result.status).toBe("error");
    expect(result.error).toContain("نمی‌توانم اطلاعات ریسک");
  });

  it("should return success proposal with calculated values", async () => {
    const mockContext = {
      symbol: "خودرو",
      entryPrice: 1000,
      suggestedStopLoss: 950,
      suggestedShareCount: 100,
      capitalAtRisk: 5000,
      positionValue: 100000,
      warnings: [],
      lastPrice: { price: 1000, capturedAt: "2024-01-01T00:00:00Z" },
    };

    vi.mocked(contextModule.getPositionSizingContext).mockResolvedValueOnce(mockContext);

    const result = await proposePaperTrade("خودرو", 1000);
    expect(result.status).toBe("success");
    expect(result.proposal).toBeDefined();
    expect(result.proposal?.symbol).toBe("خودرو");
    expect(result.proposal?.suggestedShareCount).toBe(100);
    expect(result.proposal?.suggestedStopLoss).toBe(950);
  });

  it("should include disclaimer in proposal", async () => {
    const mockContext = {
      symbol: "خودرو",
      entryPrice: 1000,
      suggestedStopLoss: 950,
      suggestedShareCount: 100,
      capitalAtRisk: 5000,
      positionValue: 100000,
      warnings: [],
      lastPrice: { price: 1000, capturedAt: "2024-01-01T00:00:00Z" },
    };

    vi.mocked(contextModule.getPositionSizingContext).mockResolvedValueOnce(mockContext);

    const result = await proposePaperTrade("خودرو", 1000);
    expect(result.proposal?.disclaimerText).toBeDefined();
    expect(result.proposal?.disclaimerText).toContain("تصمیم و ریسک نهایی");
  });
});

