import { fetchWithRetry } from "./http.ts";

const BRSAPI_SYMBOL_URL = "https://Api.BrsApi.ir/Tsetmc/Symbol.php";

export interface BrsApiSymbolQuote {
  symbol: string;
  lastPrice: number | null;
  closingPrice: number | null;
  raw: unknown;
}

/**
 * دیتای جامع یک نماد بورس ایران از BrsApi (Tsetmc/Symbol.php).
 * l18 نام نماد به فارسی است (مثلاً «خودرو»).
 * طبق قید پروژه، هر دو قیمت را جدا نگه می‌داریم: pl (آخرین قیمت) و pc (قیمت پایانی).
 */
export async function fetchBrsApiSymbol(symbol: string, apiKey: string): Promise<BrsApiSymbolQuote> {
  const url = `${BRSAPI_SYMBOL_URL}?key=${encodeURIComponent(apiKey)}&l18=${encodeURIComponent(symbol)}`;
  const res = await fetchWithRetry(url);
  const raw = await res.json();

  return {
    symbol,
    lastPrice: raw?.pl ?? null,
    closingPrice: raw?.pc ?? null,
    raw,
  };
}
