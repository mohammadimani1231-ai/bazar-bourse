const TROY_OUNCE_GRAMS = 31.1034768;
const COIN_GOLD_GRAMS = 8.133; // وزن طلای سکهٔ امامی
const COIN_PURITY = 0.9; // عیار ۹۰۰

/** بازده درصدی روزانهٔ متوالی یک سری قیمت (طول خروجی = طول ورودی - ۱) */
export function dailyPctChanges(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (prev > 0 && cur > 0) out.push(((cur - prev) / prev) * 100);
  }
  return out;
}

/** z-score یک مقدار نسبت به میانگین/انحراف‌معیار یک سری؛ نمونهٔ کوچک‌تر از ۱۰ → null */
export function zScore(latest: number, series: number[]): number | null {
  if (series.length < 10) return null;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const variance = series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length;
  const std = Math.sqrt(variance);
  if (std === 0) return null;
  return (latest - mean) / std;
}

/**
 * حباب سکه امامی = (قیمت سکه − ارزش ذاتی طلای آن) ÷ ارزش ذاتی، به درصد.
 * ارزش ذاتی از انس جهانی (دلار) × نرخ دلار آزاد (ریال) ÷ وزن هر اونس × وزن طلای سکه × عیار.
 */
export function coinBubblePct(
  coinPriceIrr: number | null,
  goldOuncePriceUsd: number | null,
  usdIrr: number | null,
): number | null {
  if (coinPriceIrr == null || goldOuncePriceUsd == null || usdIrr == null) return null;
  const goldPricePerGramIrr = (goldOuncePriceUsd * usdIrr) / TROY_OUNCE_GRAMS;
  const intrinsicValue = goldPricePerGramIrr * COIN_GOLD_GRAMS * COIN_PURITY;
  if (intrinsicValue <= 0) return null;
  return ((coinPriceIrr - intrinsicValue) / intrinsicValue) * 100;
}

export interface TensionComponents {
  /** z-score قدرمطلق نوسان روزانهٔ دلار آزاد نسبت به توزیع ۹۰ روز اخیر (بی‌جهت — هر دو طرف بی‌ثباتی است) */
  usdVolatilityZ: number | null;
  /**
   * حباب سکه به درصد، نرمال‌شده به مقیاسی قابل‌مقایسه با z-score. چون تاریخچهٔ کافی برای
   * محاسبهٔ توزیع واقعی حباب در دسترس نیست (coin_emami تازه جمع‌آوری می‌شود)، به‌جای z-score
   * واقعی از تقسیم بر ۱۰ استفاده می‌شود (حباب معمول آرام ~۰-۱۰٪، تنشی ~۲۰-۴۰٪+) — تقریب عملی،
   * نه آماری دقیق؛ وقتی تاریخچهٔ کافی جمع شد باید به z-score واقعی ارتقا یابد.
   */
  coinBubblePct: number | null;
  /** z-score علامت‌دار تغییر روزانهٔ برنت (فقط جهش مثبت = صرف ریسک ژئوپلیتیک) */
  brentChangeZ: number | null;
}

export interface TensionResult {
  /** میانگین سه مؤلفه در مقیاس z-score؛ اگر همه null بودند، null */
  rawScore: number | null;
  /** rawScore بازمقیاس‌شده به ۰-۱۰۰ برای نمایش gauge؛ ۵۰=خنثی */
  gaugeValue: number | null;
}

export function computeTensionIndex(components: TensionComponents): TensionResult {
  const bubbleScaled = components.coinBubblePct == null ? null : components.coinBubblePct / 10;
  const parts = [components.usdVolatilityZ, bubbleScaled, components.brentChangeZ].filter(
    (v): v is number => v != null,
  );
  if (parts.length === 0) return { rawScore: null, gaugeValue: null };

  const rawScore = parts.reduce((a, b) => a + b, 0) / parts.length;
  const gaugeValue = Math.max(0, Math.min(100, 50 + rawScore * 15));
  return { rawScore, gaugeValue };
}
