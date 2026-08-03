import type { YahooQuote } from "../data-sources/yahoo.ts";
import type { BrsApiGoldCurrencyResponse } from "../data-sources/brsapi.ts";

export interface GlobalQuoteRow {
  asset: string;
  price: number | null;
  change_pct: number | null;
  captured_at: string;
}

function changePct(price: number | null, previousClose: number | null): number | null {
  if (price == null || previousClose == null || previousClose === 0) return null;
  return ((price - previousClose) / previousClose) * 100;
}

/** یک نماد Yahoo (مثل BZ=F) را به سطر global_quotes با asset دلخواه تبدیل می‌کند. */
export function yahooQuoteToGlobalQuoteRow(
  asset: string,
  quote: YahooQuote,
  capturedAt: string,
): GlobalQuoteRow {
  return {
    asset,
    price: quote.regularMarketPrice,
    change_pct: changePct(quote.regularMarketPrice, quote.previousClose),
    captured_at: capturedAt,
  };
}

const GOLD_CURRENCY_ASSET_MAP: Record<string, string> = {
  USD: "usd_irr",
  IR_GOLD_18K: "gold_18k",
  IR_COIN_EMAMI: "coin_emami",
};

/** پاسخ Gold_Currency.php را فقط برای دارایی‌های موردنیاز ما (نگاشت‌شده در GOLD_CURRENCY_ASSET_MAP) به سطر تبدیل می‌کند. */
export function brsApiGoldCurrencyToGlobalQuoteRows(
  data: BrsApiGoldCurrencyResponse,
  capturedAt: string,
): GlobalQuoteRow[] {
  const items = [...(data.gold ?? []), ...(data.currency ?? [])];
  const rows: GlobalQuoteRow[] = [];

  for (const item of items) {
    const asset = GOLD_CURRENCY_ASSET_MAP[item.symbol];
    if (!asset) continue;
    rows.push({
      asset,
      price: typeof item.price === "number" ? item.price : null,
      change_pct: typeof item.change_percent === "number" ? item.change_percent : null,
      captured_at: capturedAt,
    });
  }

  return rows;
}
