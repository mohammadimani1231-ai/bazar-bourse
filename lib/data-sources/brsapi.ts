import { fetchWithRetry } from "./http.ts";

const BRSAPI_SYMBOL_URL = "https://Api.BrsApi.ir/Tsetmc/Symbol.php";
const BRSAPI_ALL_SYMBOLS_URL = "https://Api.BrsApi.ir/Tsetmc/AllSymbols.php";
const BRSAPI_GOLD_CURRENCY_URL = "https://Api.BrsApi.ir/Market/Gold_Currency.php";

/** شکل خام یک ردیف نماد از Tsetmc/Symbol.php یا Tsetmc/AllSymbols.php — فقط فیلدهایی که استفاده می‌کنیم. */
export interface BrsApiRawSymbolRow {
  l18?: string;
  pl?: number;
  pc?: number;
  tvol?: number;
  tval?: number;
  tno?: number;
  Buy_I_Volume?: number;
  Buy_N_Volume?: number;
  Sell_I_Volume?: number;
  Sell_N_Volume?: number;
  Buy_CountI?: number;
  Sell_CountI?: number;
  pd1?: number;
  qd1?: number;
  po1?: number;
  qo1?: number;
  tmax?: number;
  tmin?: number;
  bvol?: number;
  [key: string]: unknown;
}

export interface BrsApiSymbolQuote {
  symbol: string;
  lastPrice: number | null;
  closingPrice: number | null;
  raw: BrsApiRawSymbolRow;
}

/**
 * دیتای جامع یک نماد بورس ایران از BrsApi (Tsetmc/Symbol.php).
 * l18 نام نماد به فارسی است (مثلاً «خودرو»).
 * طبق قید پروژه، هر دو قیمت را جدا نگه می‌داریم: pl (آخرین قیمت) و pc (قیمت پایانی).
 */
export async function fetchBrsApiSymbol(symbol: string, apiKey: string): Promise<BrsApiSymbolQuote> {
  const url = `${BRSAPI_SYMBOL_URL}?key=${encodeURIComponent(apiKey)}&l18=${encodeURIComponent(symbol)}`;
  const res = await fetchWithRetry(url);
  const raw = (await res.json()) as BrsApiRawSymbolRow;

  return {
    symbol,
    lastPrice: raw?.pl ?? null,
    closingPrice: raw?.pc ?? null,
    raw,
  };
}

/**
 * همهٔ نمادهای بورس/فرابورس در یک درخواست (سهمیهٔ روزانه بسیار محدودتر از تک‌نماد است،
 * پس collect-tse باید همین را صدا بزند و سمت کلاینت فیلتر کند، نه N بار Symbol.php).
 */
export async function fetchBrsApiAllSymbols(apiKey: string): Promise<BrsApiRawSymbolRow[]> {
  const url = `${BRSAPI_ALL_SYMBOLS_URL}?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithRetry(url, {}, { timeoutMs: 15000 });
  return (await res.json()) as BrsApiRawSymbolRow[];
}

export interface BrsApiGoldCurrencyItem {
  symbol: string;
  price: number;
  change_percent?: number;
}

export interface BrsApiGoldCurrencyResponse {
  gold: BrsApiGoldCurrencyItem[];
  currency: BrsApiGoldCurrencyItem[];
  cryptocurrency: BrsApiGoldCurrencyItem[];
}

/** قیمت لحظه‌ای طلا/سکه/ارز (نرخ بازار آزاد) از BrsApi (Market/Gold_Currency.php). */
export async function fetchBrsApiGoldCurrency(apiKey: string): Promise<BrsApiGoldCurrencyResponse> {
  const url = `${BRSAPI_GOLD_CURRENCY_URL}?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithRetry(url);
  return (await res.json()) as BrsApiGoldCurrencyResponse;
}
