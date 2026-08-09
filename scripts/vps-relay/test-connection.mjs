// تست اتصال VPS ایرانی: BrsApi (داخل ایران، باید سریع باشه) -> Supabase (خروجی از ایران، نکتهٔ نامطمئن).
// اجرا: BRSAPI_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node test-connection.mjs
//
// فقط یک تست یک‌باره است، نه سرویس دائمی — هدف: قبل از سرمایه‌گذاری روی راه‌حل کامل (cron دائمی
// روی VPS)، مطمئن شویم مسیر VPS(ایران) -> Supabase واقعاً کار می‌کند.

import { createClient } from "@supabase/supabase-js";

const BRSAPI_KEY = process.env.BRSAPI_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BRSAPI_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("خطا: BRSAPI_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY باید ست شده باشند.");
  process.exit(1);
}

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log("۱. تماس با BrsApi (Tsetmc/Index.php) از همین VPS...");
  const brsApiStart = Date.now();
  const url = `https://Api.BrsApi.ir/Tsetmc/Index.php?key=${encodeURIComponent(BRSAPI_KEY)}&type=1`;
  const summary = await fetchWithTimeout(url, 8000);
  const brsApiMs = Date.now() - brsApiStart;
  console.log(`   موفق در ${brsApiMs}ms — شاخص کل: ${summary.index}, وضعیت بازار: ${summary.state}`);

  console.log("۲. نوشتن نتیجه در Supabase (pipeline_health, source='vps-relay-test')...");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const supabaseStart = Date.now();
  const { error } = await supabase.from("pipeline_health").insert({
    source: "vps-relay-test",
    status: "ok",
    detail: `index=${summary.index} state=${summary.state} brsapi_latency_ms=${brsApiMs} از VPS ایرانی`,
    latency_ms: Date.now() - supabaseStart,
  });
  const supabaseMs = Date.now() - supabaseStart;

  if (error) {
    console.error(`   شکست بعد از ${supabaseMs}ms:`, error.message);
    process.exit(1);
  }
  console.log(`   موفق در ${supabaseMs}ms — یک ردیف در pipeline_health ثبت شد.`);
  console.log("\nهر دو مرحله موفق بود. مسیر VPS(ایران) -> Supabase کار می‌کند.");
}

main().catch((err) => {
  console.error("تست شکست خورد:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
