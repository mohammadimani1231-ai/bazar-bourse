import { describe, expect, it } from "vitest";
import { buildDailyCandle } from "./candle.ts";
import type { QuoteRow } from "./quote.ts";

function quote(overrides: Partial<QuoteRow>): QuoteRow {
  return {
    symbol: "خودرو",
    last_price: null,
    close_price: null,
    volume: null,
    value: null,
    trade_count: null,
    buy_i_volume: null,
    buy_n_volume: null,
    sell_i_volume: null,
    sell_n_volume: null,
    buy_count_i: null,
    sell_count_i: null,
    bid1_price: null,
    bid1_volume: null,
    ask1_price: null,
    ask1_volume: null,
    price_max: null,
    price_min: null,
    base_volume: null,
    captured_at: "2026-08-03T05:30:00.000Z",
    ...overrides,
  };
}

describe("buildDailyCandle", () => {
  it("open را از اولین اسنپ‌شات و close را از آخرین اسنپ‌شات روز می‌گیرد", () => {
    const quotes = [
      quote({ captured_at: "2026-08-03T05:30:00.000Z", last_price: 540 }),
      quote({ captured_at: "2026-08-03T07:00:00.000Z", last_price: 555 }),
      quote({ captured_at: "2026-08-03T09:00:00.000Z", last_price: 550, close_price: 552 }),
    ];
    const candle = buildDailyCandle("خودرو", "2026-08-03", quotes);

    expect(candle?.open).toBe(540);
    expect(candle?.close).toBe(550);
    expect(candle?.final_price).toBe(552);
  });

  it("high/low را از بیشینه/کمینهٔ last_price در طول روز می‌سازد، نه از یک اسنپ‌شات", () => {
    const quotes = [
      quote({ captured_at: "2026-08-03T05:30:00.000Z", last_price: 540 }),
      quote({ captured_at: "2026-08-03T07:00:00.000Z", last_price: 560 }),
      quote({ captured_at: "2026-08-03T09:00:00.000Z", last_price: 535 }),
    ];
    const candle = buildDailyCandle("خودرو", "2026-08-03", quotes);

    expect(candle?.high).toBe(560);
    expect(candle?.low).toBe(535);
  });

  it("volume/value/counts را از آخرین اسنپ‌شات می‌گیرد چون این فیلدها در BrsApi تجمعی روزانه‌اند", () => {
    const quotes = [
      quote({ captured_at: "2026-08-03T05:30:00.000Z", volume: 100, value: 1000, buy_count_i: 1 }),
      quote({ captured_at: "2026-08-03T09:00:00.000Z", volume: 900, value: 9000, buy_count_i: 5 }),
    ];
    const candle = buildDailyCandle("خودرو", "2026-08-03", quotes);

    expect(candle?.volume).toBe(900);
    expect(candle?.value).toBe(9000);
    expect(candle?.buy_count_i).toBe(5);
  });

  it("ترتیب ورودی را نادیده می‌گیرد و بر اساس captured_at مرتب می‌کند", () => {
    const quotes = [
      quote({ captured_at: "2026-08-03T09:00:00.000Z", last_price: 550 }),
      quote({ captured_at: "2026-08-03T05:30:00.000Z", last_price: 540 }),
    ];
    const candle = buildDailyCandle("خودرو", "2026-08-03", quotes);

    expect(candle?.open).toBe(540);
    expect(candle?.close).toBe(550);
  });

  it("برای روز بدون هیچ quote، null برمی‌گرداند", () => {
    expect(buildDailyCandle("خودرو", "2026-08-03", [])).toBeNull();
  });
});
