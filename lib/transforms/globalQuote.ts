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

const GOLD_ASSET_MAP: Record<string, string> = {
  IR_GOLD_18K: "gold_18k",
  IR_COIN_EMAMI: "coin_emami",
};

const CURRENCY_ASSET_MAP: Record<string, string> = {
  USD: "usd_irr",
};

// آرایهٔ gold. از Gold_Currency.php واقعاً به ریال است (سازگار با benchmark_candles، تأیید‌شده
// روی دادهٔ زنده) ولی آرایهٔ currency. همان endpoint به هزارتومان است (نه تومان یا ریال) — یک
// ناسازگاری واقعی در خود BrsApi، نه اشتباه ما. تومان: تومان → هزارتومان × ۱۰۰۰ (= ریال).
// بدون این ×۱۰۰۰، usd_irr در global_quotes با usd_irr در benchmark_candles (که واحدش ریال است)
// ۱۰۰۰ برابر اختلاف می‌گیرد — دقیقاً همین باگ در فاز ۵ حین ساخت tension_index کشف شد.
const KILO_TOMAN_TO_RIAL = 1000;

/** پاسخ Gold_Currency.php را فقط برای دارایی‌های موردنیاز ما به سطر global_quotes (همیشه ریال) تبدیل می‌کند. */
export function brsApiGoldCurrencyToGlobalQuoteRows(
  data: BrsApiGoldCurrencyResponse,
  capturedAt: string,
): GlobalQuoteRow[] {
  const rows: GlobalQuoteRow[] = [];

  for (const item of data.gold ?? []) {
    const asset = GOLD_ASSET_MAP[item.symbol];
    if (!asset) continue;
    rows.push({
      asset,
      price: typeof item.price === "number" ? item.price : null,
      change_pct: typeof item.change_percent === "number" ? item.change_percent : null,
      captured_at: capturedAt,
    });
  }

  for (const item of data.currency ?? []) {
    const asset = CURRENCY_ASSET_MAP[item.symbol];
    if (!asset) continue;
    rows.push({
      asset,
      price: typeof item.price === "number" ? item.price * KILO_TOMAN_TO_RIAL : null,
      change_pct: typeof item.change_percent === "number" ? item.change_percent : null,
      captured_at: capturedAt,
    });
  }

  return rows;
}
