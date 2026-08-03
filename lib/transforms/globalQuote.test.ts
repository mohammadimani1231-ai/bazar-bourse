import { describe, expect, it } from "vitest";
import { yahooQuoteToGlobalQuoteRow, brsApiGoldCurrencyToGlobalQuoteRows } from "./globalQuote.ts";
import type { YahooQuote } from "../data-sources/yahoo.ts";
import type { BrsApiGoldCurrencyResponse } from "../data-sources/brsapi.ts";

describe("yahooQuoteToGlobalQuoteRow", () => {
  it("قیمت و درصد تغییر نسبت به previousClose را محاسبه می‌کند", () => {
    const quote: YahooQuote = {
      symbol: "BZ=F",
      regularMarketPrice: 83.6,
      previousClose: 87.93,
      currency: "USD",
      raw: {},
    };
    const row = yahooQuoteToGlobalQuoteRow("brent", quote, "2026-08-03T12:00:00.000Z");

    expect(row.asset).toBe("brent");
    expect(row.price).toBe(83.6);
    expect(row.change_pct).toBeCloseTo(((83.6 - 87.93) / 87.93) * 100, 5);
    expect(row.captured_at).toBe("2026-08-03T12:00:00.000Z");
  });

  it("وقتی previousClose موجود نیست، change_pct را null می‌گذارد نه Infinity/NaN", () => {
    const quote: YahooQuote = {
      symbol: "BZ=F",
      regularMarketPrice: 83.6,
      previousClose: null,
      currency: "USD",
      raw: {},
    };
    const row = yahooQuoteToGlobalQuoteRow("brent", quote, "2026-08-03T12:00:00.000Z");
    expect(row.change_pct).toBeNull();
  });
});

describe("brsApiGoldCurrencyToGlobalQuoteRows", () => {
  const RESPONSE: BrsApiGoldCurrencyResponse = {
    gold: [
      { symbol: "IR_GOLD_18K", price: 18359600, change_percent: 0.43 },
      { symbol: "IR_COIN_EMAMI", price: 184995000, change_percent: 0.55 },
      { symbol: "XAUUSD", price: 4057, change_percent: 0.1 },
    ],
    currency: [
      { symbol: "USD", price: 192880, change_percent: 0.98 },
      { symbol: "EUR", price: 222160, change_percent: 0.2 },
    ],
    cryptocurrency: [{ symbol: "BTC", price: 63932, change_percent: 1.2 }],
  };

  it("فقط دارایی‌های نگاشت‌شده (usd_irr، gold_18k، coin_emami) را برمی‌گرداند", () => {
    const rows = brsApiGoldCurrencyToGlobalQuoteRows(RESPONSE, "2026-08-03T12:00:00.000Z");
    const assets = rows.map((r) => r.asset).sort();
    expect(assets).toEqual(["coin_emami", "gold_18k", "usd_irr"]);
  });

  it("XAUUSD، EUR و ارزهای دیجیتال را نادیده می‌گیرد چون منبع رسمی آن‌ها Yahoo است", () => {
    const rows = brsApiGoldCurrencyToGlobalQuoteRows(RESPONSE, "2026-08-03T12:00:00.000Z");
    expect(rows.find((r) => r.asset === "gold_ounce")).toBeUndefined();
    expect(rows).toHaveLength(3);
  });
});
