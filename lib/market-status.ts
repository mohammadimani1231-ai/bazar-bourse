import { tehranDayBounds } from "./time/tehranDay.ts";

const THEORETICAL_OPEN_HOUR_UTC = 5.5;
const THEORETICAL_CLOSE_HOUR_UTC = 9.5;
const TRADING_WEEKDAYS_UTC = new Set([6, 0, 1, 2, 3]); // شنبه..چهارشنبه (JS getUTCDay: یکشنبه=0)
const STALE_THRESHOLD_MS = 15 * 60 * 1000;

/** آیا امروز جزو شنبه‌تاچهارشنبه است — فقط شرط لازم روز، ربطی به ساعت ندارد. */
export function isTradingWeekday(nowUtc: Date): boolean {
  return TRADING_WEEKDAYS_UTC.has(nowUtc.getUTCDay());
}

/** آیا این لحظه در بازهٔ نظری معاملات (شنبه‌تاچهارشنبه ۵:۳۰-۹:۳۰ UTC) است — فقط شرط لازم، کافی نیست. */
export function isWithinTheoreticalTradingWindow(nowUtc: Date): boolean {
  if (!isTradingWeekday(nowUtc)) return false;
  const hours = nowUtc.getUTCHours() + nowUtc.getUTCMinutes() / 60;
  return hours >= THEORETICAL_OPEN_HOUR_UTC && hours < THEORETICAL_CLOSE_HOUR_UTC;
}

export interface VolumeSample {
  capturedAt: string;
  volume: number | null;
}

/**
 * برای jobهای شبانه (build-candles، compute-rank) که بعد از ساعات بازار اجرا می‌شوند و
 * باید بدانند «امروز اصلاً روز معاملاتی بود یا نه»، نه «همین الان بازار باز است یا نه».
 * روز هفته + جدول تعطیلات را چک می‌کند؛ اگر todayVolumes (اسنپ‌شات‌های امروزِ یک نماد
 * پرمعامله) داده شود و همه‌شان یکسان باشند (بدون واریانس)، یعنی هیچ معامله‌ای رخ نداده —
 * حتی اگر در جدول تعطیلات ثبت نشده باشد (تعطیلی اعلامی/نامنظم).
 */
export function wasTodayTradingDay(
  nowUtc: Date,
  holidayDates: Set<string>,
  todayVolumes: VolumeSample[] = [],
): boolean {
  if (!isTradingWeekday(nowUtc)) return false;

  const { date: tehranDate } = tehranDayBounds(nowUtc);
  if (holidayDates.has(tehranDate)) return false;

  const values = todayVolumes.map((v) => v.volume).filter((v): v is number => v != null);
  if (values.length >= 2 && values.every((v) => v === values[0])) return false;

  return true;
}

export interface MarketStatusInputs {
  nowUtc: Date;
  /** تاریخ‌های گرگوریان (YYYY-MM-DD) از جدول market_holidays — لایهٔ کمکی، نه منبع حقیقت. */
  holidayDates: Set<string>;
  /** اسنپ‌شات‌های اخیر حجم یک نماد پرمعامله، هر ترتیبی — برای heuristic «معاملهٔ تازه». */
  recentVolumes: VolumeSample[];
}

export type MarketClosedReason = "outside_theoretical_hours" | "holiday" | "no_volume_change";

export type MarketStatusResult = { open: true } | { open: false; reason: MarketClosedReason };

/**
 * منبع حقیقتِ «آیا بازار الان باز است» (قید CLAUDE.md #11) — هرگز از روز هفته به‌تنهایی
 * نتیجه‌گیری نکن. ترتیب چک: بازهٔ نظری → جدول تعطیلات → heuristic تغییر حجم اخیر.
 */
export function isMarketOpen(inputs: MarketStatusInputs): MarketStatusResult {
  const { nowUtc, holidayDates, recentVolumes } = inputs;

  if (!isWithinTheoreticalTradingWindow(nowUtc)) {
    return { open: false, reason: "outside_theoretical_hours" };
  }

  const { date: tehranDate } = tehranDayBounds(nowUtc);
  if (holidayDates.has(tehranDate)) {
    return { open: false, reason: "holiday" };
  }

  if (recentVolumes.length >= 2) {
    const sorted = [...recentVolumes].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    const latest = sorted[sorted.length - 1];
    const cutoff = new Date(nowUtc.getTime() - STALE_THRESHOLD_MS).toISOString();
    const olderEnough = sorted.filter((v) => v.capturedAt <= cutoff);
    const reference = olderEnough[olderEnough.length - 1];
    if (reference && latest.volume != null && reference.volume != null && latest.volume === reference.volume) {
      return { open: false, reason: "no_volume_change" };
    }
  }

  return { open: true };
}
