import { describe, expect, it } from "vitest";
import { brsApiRowToQuoteRow } from "./quote.ts";
import type { BrsApiRawSymbolRow } from "../data-sources/brsapi.ts";

// نمونهٔ واقعی گرفته‌شده از BrsApi Tsetmc/Symbol.php برای «خودرو»
const RAW_KHODRO: BrsApiRawSymbolRow = {
  l18: "خودرو",
  pl: 566,
  pc: 566,
  tvol: 4473137540,
  tval: 2531269497989,
  tno: 6238,
  Buy_I_Volume: 4202621718,
  Buy_N_Volume: 270515822,
  Sell_I_Volume: 2821656040,
  Sell_N_Volume: 1651481500,
  Buy_CountI: 1093,
  Sell_CountI: 1753,
  pd1: 566,
  qd1: 883508600,
  po1: 610,
  qo1: 1300000,
  tmax: 566,
  tmin: 534,
  bvol: 1,
};

describe("brsApiRowToQuoteRow", () => {
  it("پاسخ خام BrsApi را به سطر جدول quotes نگاشت می‌کند", () => {
    const row = brsApiRowToQuoteRow("خودرو", RAW_KHODRO, "2026-08-03T21:14:18.567Z");

    expect(row).toEqual({
      symbol: "خودرو",
      last_price: 566,
      close_price: 566,
      volume: 4473137540,
      value: 2531269497989,
      trade_count: 6238,
      buy_i_volume: 4202621718,
      buy_n_volume: 270515822,
      sell_i_volume: 2821656040,
      sell_n_volume: 1651481500,
      buy_count_i: 1093,
      sell_count_i: 1753,
      bid1_price: 566,
      bid1_volume: 883508600,
      ask1_price: 610,
      ask1_volume: 1300000,
      price_max: 566,
      price_min: 534,
      base_volume: 1,
      captured_at: "2026-08-03T21:14:18.567Z",
    });
  });

  it("price_max/price_min را از سقف/کف مجاز (tmax/tmin) می‌گیرد نه بیشینه/کمینهٔ معاملات (pmax/pmin)", () => {
    const raw: BrsApiRawSymbolRow = { ...RAW_KHODRO, tmax: 4101, tmin: 3863, pmax: 3910, pmin: 3863 } as BrsApiRawSymbolRow;
    const row = brsApiRowToQuoteRow("خودرو", raw, "2026-08-03T21:14:18.567Z");
    expect(row.price_max).toBe(4101);
    expect(row.price_min).toBe(3863);
  });

  it("فیلدهای غایب یا غیرعددی را null می‌گذارد، نه undefined یا NaN", () => {
    const row = brsApiRowToQuoteRow("نامعلوم", {}, "2026-08-03T21:14:18.567Z");
    expect(row.last_price).toBeNull();
    expect(row.close_price).toBeNull();
    expect(row.volume).toBeNull();
    expect(row.base_volume).toBeNull();
  });
});
