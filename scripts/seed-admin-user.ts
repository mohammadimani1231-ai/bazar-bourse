/**
 * اسکریپت یک‌بارمصرف محلی برای ساخت اولین حساب ادمین سایت (یا ریست رمز یک ادمین موجود) —
 * چون site_users هیچ RLS policy عمومی ندارد و از داخل خودِ سایت هم بدون یک حساب ادمین موجود
 * نمی‌شود حساب اول را ساخت (مرغ‌وتخم‌مرغ). این اسکریپت مستقیم با service_role کار می‌کند،
 * دقیقاً مثل الگوی scripts/backtest.ts::loadEnvLocal (بدون وابستگی جدید مثل dotenv).
 *
 * استفاده: npx tsx scripts/seed-admin-user.ts <username> <password>
 * اگر username از قبل باشد، رمزش را با رمز جدید عوض می‌کند (idempotent) — برای وقتی که
 * می‌خواهی رمز خودت را عوض کنی هم همین اسکریپت کافی است.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { generateSalt, hashPassword } from "../lib/auth.ts";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadEnvLocal(): Record<string, string> {
  const envPath = path.join(ROOT, ".env.local");
  const values: Record<string, string> = {};
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const idx = trimmed.indexOf("=");
      values[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  } catch {
    // فایل نیست، فقط process.env استفاده می‌شود
  }
  return values;
}

async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password) {
    console.error("استفاده: npx tsx scripts/seed-admin-user.ts <username> <password>");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("رمز باید حداقل ۸ کاراکتر باشد.");
    process.exit(1);
  }

  const env = { ...loadEnvLocal(), ...process.env };
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY باید در .env.local باشند.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);

  const { error } = await supabase
    .from("site_users")
    .upsert(
      { username, password_hash: passwordHash, password_salt: salt, is_admin: true, session_token: null },
      { onConflict: "username" },
    );

  if (error) {
    console.error("ثبت ناموفق بود:", error.message);
    process.exit(1);
  }

  console.log(`✓ حساب ادمین «${username}» ساخته/به‌روزرسانی شد. حالا با همین نام کاربری و رمز وارد سایت شو.`);
}

main();
