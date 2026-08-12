/**
 * تقریب تعداد روزهای معاملاتی بین دو زمان — هفتهٔ معاملاتی بورس تهران ۵ روز است
 * (شنبه تا چهارشنبه، پنجشنبه و جمعه تعطیل).
 *
 * محدودیت آگاهانه: تعطیلات رسمی/قمری را نمی‌بیند، پس عدد کمی بیش‌برآورد است. برای شرط
 * «سقف مدت نگه‌داری ۲۰ روز» کافی است و عمداً تابعی خالص و بدون وابستگی به جدول
 * market_holidays نگه داشته شده تا تست‌پذیر بماند. هر جا تشخیص «باز بودن بازار» لازم است،
 * همچنان lib/market-status.ts منبع حقیقت است (قید #۱۱).
 */
export function tradingDaysBetween(fromIso: string, toIso: string): number {
  const calendarDays = Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / (24 * 60 * 60 * 1000));
  if (calendarDays <= 0) return 0;
  return Math.floor((calendarDays / 7) * 5);
}
