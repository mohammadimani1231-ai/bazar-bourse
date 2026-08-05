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
 *
 * **به‌روزرسانی ۲۰۲۶-۰۸-۰۵ با شواهد واقعی، نه فرض:** تست زندهٔ پروکسی Vercel (پایین‌تر) نشان داد
 * خطای واقعی روی هر دو ابر (Supabase و Vercel) `ConnectTimeoutError` است، نه پاسخ کند — یعنی
 * این یک قطعی احتمالاً firewall/ASN-محور روی زیرساخت ابری است، نه چیزی که با «آدرس IP دیگر»
 * قابل دورزدن باشد. مشاهدهٔ واقعی pipeline_health اما نشان داد این قطعی مطلق نیست: از ۳۰۶ اجرای
 * اخیر، ۶ تا (~۲٪) موفق شدند و همیشه سریع (۳-۴ ثانیه) — پس تلاش بیشتر در بازهٔ زمانی یکسان،
 * شانس برخورد با آن پنجرهٔ کوچک موفقیت را بالا می‌برد. به‌جای ۳ تلاش با timeout ۲۰ ثانیه (بدترین
 * حالت ~۶۳ ثانیه)، حالا ۷ تلاش با timeout ۸ ثانیه (بدترین حالت مشابه ~۶۶ ثانیه، هنوز امن زیر
 * بازهٔ کرون ۲ دقیقه‌ای) — timeout کوتاه‌تر منطقی است چون وقتی این endpoint واقعاً جواب می‌دهد
 * همیشه در چند ثانیه است، نه نزدیک به مرز timeout.
 */
export async function fetchBrsApiAllSymbols(apiKey: string): Promise<BrsApiRawSymbolRow[]> {
  const url = `${BRSAPI_ALL_SYMBOLS_URL}?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithRetry(url, {}, { timeoutMs: 8000, retries: 6, backoffMs: 500 });
  return (await res.json()) as BrsApiRawSymbolRow[];
}

/**
 * مسیر جایگزین برای وقتی fetchBrsApiAllSymbols مستقیم شکست بخورد: به‌جای BrsApi، Route Handler
 * خود پروژه در Vercel (`app/api/internal/brsapi-all-symbols`) را صدا می‌زند.
 * **صادقانه (۲۰۲۶-۰۸-۰۵):** فرضیهٔ اولیه («IP/ASN جدای Vercel این قطعی را دور می‌زند») با تست
 * زنده رد شد — تماس از Vercel هم دقیقاً با `ConnectTimeoutError` مشابه شکست خورد. این تابع را
 * حذف نکردیم چون بی‌ضرر است (شکست سریع، بودجهٔ کمی از کرون می‌گیرد) و اگر روزی وضعیت شبکهٔ
 * Vercel عوض شد بدون تغییر کد فایده می‌دهد؛ ولی **در عمل تکیه‌گاه اصلی همان retry بیشتر روی
 * تماس مستقیم است**، نه این پروکسی. جزئیات در CLAUDE.md.
 */
export async function fetchAllSymbolsViaProxy(
  siteUrl: string,
  proxySecret: string,
): Promise<BrsApiRawSymbolRow[]> {
  const url = `${siteUrl.replace(/\/$/, "")}/api/internal/brsapi-all-symbols`;
  const res = await fetchWithRetry(
    url,
    { headers: { "x-proxy-secret": proxySecret } },
    { timeoutMs: 8000, retries: 1, backoffMs: 500 },
  );
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
