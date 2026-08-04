import { format as formatJalaliDate } from "date-fns-jalali";

const TEHRAN_TZ = "Asia/Tehran";

const tehranPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TEHRAN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * یک Date «ساعت دیواری تهران» می‌سازد که خواندنش با getterهای local جاوااسکریپت
 * (که date-fns-jalali هم از همان استفاده می‌کند) مستقل از timezone سیستم اجراکننده
 * (سرور Vercel یا مرورگر کاربر با هر tz) درست باشد — به‌جای دستکاری offset که به tz
 * ماشین اجرا وابسته و شکننده است.
 */
function toTehranWallClock(input: Date | string): Date {
  const utcDate = typeof input === "string" ? new Date(input) : input;
  const parts = tehranPartsFormatter.formatToParts(utcDate);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return new Date(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
}

/** تاریخ شمسی مثل «۱۴۰۵/۰۵/۱۴» */
export function formatJalaliDay(input: Date | string): string {
  return formatJalaliDate(toTehranWallClock(input), "yyyy/MM/dd");
}

/** تاریخ و ساعت شمسی مثل «۱۴۰۵/۰۵/۱۴ ۰۰:۰۵» */
export function formatJalaliDateTime(input: Date | string): string {
  return formatJalaliDate(toTehranWallClock(input), "yyyy/MM/dd HH:mm");
}

/** فقط ساعت:دقیقهٔ تهران، مثل «۰۰:۰۵» */
export function formatTehranTime(input: Date | string): string {
  return formatJalaliDate(toTehranWallClock(input), "HH:mm");
}

/** تاریخ شمسی با نام ماه، مثل «۱۴ مرداد ۱۴۰۵» */
export function formatJalaliLong(input: Date | string): string {
  return formatJalaliDate(toTehranWallClock(input), "d MMMM yyyy");
}
