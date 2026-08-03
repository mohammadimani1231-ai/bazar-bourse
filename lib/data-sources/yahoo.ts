import { fetchWithRetry } from "./http.ts";

const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";

export interface YahooQuote {
  symbol: string;
  regularMarketPrice: number | null;
  previousClose: number | null;
  currency: string | null;
  raw: unknown;
}

/**
 * قیمت لحظه‌ای یک نماد جهانی از Yahoo Finance (API غیررسمی).
 * نمونه نمادها: BZ=F (برنت)، GC=F (انس طلا)، HG=F (مس)، DX-Y.NYB، ^GSPC
 */
export async function fetchYahooQuote(symbol: string): Promise<YahooQuote> {
  const res = await fetchWithRetry(`${YAHOO_CHART_URL}${encodeURIComponent(symbol)}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const json = await res.json();

  const result = json?.chart?.result?.[0];
  if (!result) {
    const errDescription = json?.chart?.error?.description;
    throw new Error(errDescription ?? "پاسخ نامعتبر از Yahoo Finance");
  }

  const meta = result.meta;
  return {
    symbol,
    regularMarketPrice: meta?.regularMarketPrice ?? null,
    previousClose: meta?.chartPreviousClose ?? meta?.previousClose ?? null,
    currency: meta?.currency ?? null,
    raw: json,
  };
}
