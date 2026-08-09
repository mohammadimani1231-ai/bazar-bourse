# VPS Relay (رفع موقت مشکل اتصال BrsApi از IP خارج از ایران)

طبق تأیید پشتیبانی BrsApi (۲۰۲۶-۰۸-۰۹، رجوع به CLAUDE.md): سرورهای BrsApi در ایران هستند و
اتصال از IP خارج از ایران (Supabase Edge Functions) روی «دستکاری اینترنت بین‌الملل» می‌خورد —
نه چیزی که با retry/timeout در کد حل شود. BrsApi همچنین اعلام کرده به‌زودی Supabase را برای
کاربران رایگان کلاً بلاک می‌کند.

**راه‌حل**: یک VPS ایرانی که مستقیم (داخل ایران، سریع و پایدار) از BrsApi می‌خواند و مستقیم با
`service_role` به Supabase می‌نویسد (خروجی از ایران — تست شد که کار می‌کند، برخلاف ورودی به
ایران که برای همین کار به مشکل خورد).

## چرا این پوشه (نه Edge Function)

`relay.mjs` عیناً همان توابع `lib/` پروژه (`market-status.ts`, `data-sources/brsapi.ts`,
`transforms/quote.ts`, `transforms/globalQuote.ts`) را import می‌کند — بدون پیاده‌سازی موازی.
چون این فایل‌ها با پسوند صریح `.ts` و بدون node_modules خودشان نوشته شده‌اند، روی Node.js با
[`tsx`](https://github.com/privatenumber/tsx) اجرا می‌شوند (نه ts-node، سبک‌تر و بدون کانفیگ).

## راه‌اندازی روی VPS (اوبونتو)

```bash
# ۱. کلون کل ریپو (برای دسترسی به lib/)
git clone https://github.com/mohammadimani1231-ai/bazar-bourse.git
cd bazar-bourse/scripts/vps-relay

# ۲. فقط همین پوشه را نصب کن (نه کل ریپو — سبک و سریع)
npm install

# ۳. متغیرهای محیطی (در ~/.bashrc یا یک فایل .env که خودت با dotenv/export می‌خوانی)
export SUPABASE_URL="https://nritjejqugfvgihthctz.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="..."   # از Supabase Dashboard → Settings → API
export BRSAPI_KEY="..."

# ۴. تست دستی
npx tsx relay.mjs tse
npx tsx relay.mjs market-index
npx tsx relay.mjs global-domestic
```

## زمان‌بندی (crontab)

```
# هر ۲ دقیقه، ساعات نظری بازار (۵-۹ UTC، شنبه تا چهارشنبه) — خودِ اسکریپت هم داخلی چک می‌کند
*/2 5-9 * * 6,0,1,2,3 cd /home/ubuntu/bazar-bourse/scripts/vps-relay && SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... BRSAPI_KEY=... npx tsx relay.mjs tse >> /home/ubuntu/relay-tse.log 2>&1
*/2 5-9 * * 6,0,1,2,3 cd /home/ubuntu/bazar-bourse/scripts/vps-relay && SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... BRSAPI_KEY=... npx tsx relay.mjs market-index >> /home/ubuntu/relay-market-index.log 2>&1

# هر ۱۵ دقیقه، تمام ساعات روز (همان بازهٔ collect-global قبلی)
*/15 * * * * cd /home/ubuntu/bazar-bourse/scripts/vps-relay && SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... BRSAPI_KEY=... npx tsx relay.mjs global-domestic >> /home/ubuntu/relay-global.log 2>&1
```

بهتر است مقادیر واقعی env را داخل crontab ننویسی (قابل دیدن با `crontab -l`)؛ به‌جایش یک فایل
`~/relay.env` بساز و در ابتدای هر خط crontab با `. ~/relay.env &&` لود کن.

## وضعیت در pipeline_health

سه `source` مجزا: `collect-tse`, `collect-market-index`, `collect-global-domestic` — دقیقاً
همان نام‌هایی که Edge Functionهای قبلی استفاده می‌کردند (به‌جز `collect-global-domestic` که عمداً
از `collect-global` جداست تا با وضعیت بخش Yahoo که هنوز روی Supabase است قاطی نشود). صفحهٔ
`/health` و هشدارهای تلگرام بدون تغییر همین‌ها را می‌خوانند.

## کار باقی‌مانده / محدودیت شناخته‌شده

- **pg_cron روی Supabase برای `collect-tse` و `collect-market-index` باید unschedule شود**
  (چون این‌ها را دیگر VPS انجام می‌دهد، نه Supabase — وگرنه دو منبع هم‌زمان با هم رقابت می‌کنند
  و pipeline_health را با خطاهای تکراری/بی‌ربط شلوغ می‌کنند):
  ```sql
  select cron.unschedule('collect-tse');
  select cron.unschedule('collect-market-index');
  ```
- این VPS یک نقطهٔ شکست تک (single point of failure) جدید است — اگر خودش خاموش/غیرقابل‌دسترس
  شود، هیچ هشداری غیر از «آخرین اجرای pipeline_health قدیمی شده» وجود ندارد. مانیتورینگ جدا
  (مثلاً uptime ping به خودِ VPS) در scope این تغییر نبود.
- هزینهٔ ماهانهٔ VPS باید در نظر گرفته شود (این یک هزینهٔ زیرساختی جدید و دائمی است، نه یک‌بارمصرف).
