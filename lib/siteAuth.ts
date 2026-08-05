import { createHash } from "node:crypto";

/**
 * محافظت کل سایت با یک رمز مشترک (نه سیستم کاربر/ثبت‌نام) — چون این پروژه تک‌کاربره و
 * شخصی است، فقط برای اجازه دادن به یک دوست برای بازدید/تست بدون این‌که کل اینترنت به
 * صفحات و Server Action های نوشتنی (افزودن به واچ‌لیست، سوییچ رژیم بازار، ذخیرهٔ preset)
 * دسترسی داشته باشد. مقدار کوکی هش رمز است، نه خود رمز — اگر کوکی لو برود رمز مستقیم لو نمی‌رود.
 */
export const SITE_SESSION_COOKIE = "site_session";

export function sitePasswordHash(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}
