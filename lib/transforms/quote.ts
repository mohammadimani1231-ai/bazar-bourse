import type { BrsApiRawSymbolRow } from "../data-sources/brsapi.ts";

export interface QuoteRow {
  symbol: string;
  last_price: number | null;
  close_price: number | null;
  volume: number | null;
  value: number | null;
  trade_count: number | null;
  buy_i_volume: number | null;
  buy_n_volume: number | null;
  sell_i_volume: number | null;
  sell_n_volume: number | null;
  buy_count_i: number | null;
  sell_count_i: number | null;
  bid1_price: number | null;
  bid1_volume: number | null;
  ask1_price: number | null;
  ask1_volume: number | null;
  price_max: number | null;
  price_min: number | null;
  base_volume: number | null;
  captured_at: string;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * یک ردیف خام BrsApi (Tsetmc/Symbol.php یا AllSymbols.php) را به سطر جدول quotes تبدیل می‌کند.
 * price_max/price_min یعنی سقف/کف مجاز روز (tmax/tmin) نه بیشینه/کمینهٔ معاملات روز (pmax/pmin).
 */
export function brsApiRowToQuoteRow(
  symbol: string,
  raw: BrsApiRawSymbolRow,
  capturedAt: string,
): QuoteRow {
  return {
    symbol,
    last_price: numOrNull(raw.pl),
    close_price: numOrNull(raw.pc),
    volume: numOrNull(raw.tvol),
    value: numOrNull(raw.tval),
    trade_count: numOrNull(raw.tno),
    buy_i_volume: numOrNull(raw.Buy_I_Volume),
    buy_n_volume: numOrNull(raw.Buy_N_Volume),
    sell_i_volume: numOrNull(raw.Sell_I_Volume),
    sell_n_volume: numOrNull(raw.Sell_N_Volume),
    buy_count_i: numOrNull(raw.Buy_CountI),
    sell_count_i: numOrNull(raw.Sell_CountI),
    bid1_price: numOrNull(raw.pd1),
    bid1_volume: numOrNull(raw.qd1),
    ask1_price: numOrNull(raw.po1),
    ask1_volume: numOrNull(raw.qo1),
    price_max: numOrNull(raw.tmax),
    price_min: numOrNull(raw.tmin),
    base_volume: numOrNull(raw.bvol),
    captured_at: capturedAt,
  };
}
