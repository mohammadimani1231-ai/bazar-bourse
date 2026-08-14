import { randomBytes, pbkdf2Sync, timingSafeEqual } from "node:crypto";

/**
 * سیستم کاربر/رمز واقعی (جدول site_users) — جایگزین رمز مشترک تک‌نفرهٔ قبلی. هر کاربر
 * username/password جدا دارد؛ صاحب سایت (is_admin=true) از صفحهٔ /settings/access کاربر
 * اضافه/حذف می‌کند. کوکی فقط یک توکن سشن تصادفی نگه می‌دارد (نه رمز/هشِ رمز) — با هر لاگین
 * جدید عوض می‌شود، با حذف ردیف از site_users هم فوراً باطل می‌شود (بدون نیاز به منتظرماندن
 * انقضای کوکی).
 *
 * عمداً بدون import از next/headers یا lib/supabase/adminClient.ts (که "server-only" دارد) —
 * این فایل باید هم داخل proxy.ts (middleware) و هم در scripts/seed-admin-user.ts (اجرای
 * مستقیم با tsx، بیرون از باندلر Next.js) قابل import باشد. getCurrentUser (که به هر دو
 * وابسته است) در lib/authSession.ts جداست.
 */
export const SITE_SESSION_COOKIE = "site_session";

const PBKDF2_ITERATIONS = 120_000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = "sha256";

export function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString("hex");
}

/** مقایسهٔ زمان-ثابت — جلوگیری از timing attack روی هش رمز. */
export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
