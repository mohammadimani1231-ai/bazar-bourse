/**
 * تبدیل‌های واحد مرکزی برای همهٔ دارایی‌های خارجی.
 *
 * هدف: جلوگیری از تکرار باگ «واحد پول اشتباه» با یکپارچه‌سازی تمام تبدیل‌ها در یک فایل.
 *
 * هر تابع:
 * - نام صریح دارد: X_TO_Y
 * - کامنت‌شدهٔ آن است: کدام API/فیلد این واحد رو برمی‌گردونه
 * - تنها منبع این تبدیل در کل ریپو
 */

/** BrsApi Currency.php: دلار به هزارتومان برمی‌گرداند. */
export function kiloTomanToRial(kiloToman: number | null): number | null {
  if (kiloToman == null) return null;
  return kiloToman * 1000;
}

/** معکوس: ریال به هزارتومان. */
export function rialToKiloToman(rial: number | null): number | null {
  if (rial == null) return null;
  return rial / 1000;
}

/** Benchmark/Quote واحد کل: ریال به تومان. */
export function rialToToman(rial: number | null): number | null {
  if (rial == null) return null;
  return rial / 10;
}

/** معکوس: تومان به ریال. */
export function tomanToRial(toman: number | null): number | null {
  if (toman == null) return null;
  return toman * 10;
}

/** جدول واحدهای خارجی (مرجع CLAUDE.md):
 *
 * | منبع | فیلد | واحد | تابع تبدیل | نتیجهٔ DB |
 * |------|------|------|-----------|---------|
 * | BrsApi Gold_Currency.php | currency[].price (دلار) | هزارتومان | kiloTomanToRial() | ریال |
 * | BrsApi Gold_Currency.php | gold[].price (طلا/سکه) | ریال | (بدون تبدیل) | ریال |
 * | BrsApi AllSymbols.php | quotes.pl/pc | ریال | (بدون تبدیل) | ریال |
 * | Benchmark | tedpix/tedpix_equal_weight | نقطه | (بدون تبدیل) | نقطه |
 * | Benchmark | usd_irr | ریال | (بدون تبدیل) | ریال |
 * | Yahoo Finance | regularMarketPrice | دلار | (بدون تبدیل) | دلار |
 *
 * **نمایش در UI:**
 * - ریال → تومان: rialToToman() در GlobalTickerBar.tsx
 * - دلار/نقطه: بدون تبدیل
 */
