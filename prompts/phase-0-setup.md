# فاز ۰ — زیرساخت، تست روز صفر، و حافظه پروژه

می‌خواهم یک داشبورد شخصی تحلیل بازار بورس ایران + بازارهای جهانی بسازیم (پروژه چندفازه؛ این فاز صفر است). من تنها کاربر هستم. **قبل از کدنویسی، پلن کوتاه بده و تأیید بگیر.**

## استک — قطعی

- Frontend: Next.js 14+ (App Router, TypeScript, Tailwind) روی Vercel
- Backend/DB/Scheduler: Supabase — Postgres + Edge Functions (Deno/TS) + pg_cron + pg_net + Realtime
- چارت (فازهای بعد): lightweight-charts + ECharts
- زبان UI: فارسی، RTL، فونت Vazirmatn، دارک‌مود پیش‌فرض

## کارهای این فاز

### ۱. ساخت CLAUDE.md (اول از همه)

فایل `CLAUDE.md` در ریشه ریپو بساز با دقیقاً این محتوا (در فازهای بعد به آن تکیه می‌کنیم):

```markdown
# پروژه: داشبورد تحلیل بازار بورس ایران + جهانی (تک‌کاربره، شخصی)

## استک
Next.js 14+ App Router + TypeScript + Tailwind روی Vercel (فقط UI).
Supabase = قلب سیستم: Postgres، Edge Functions (Deno)، pg_cron + pg_net زمان‌بند، Realtime.

## قیدهای سخت — هرگز نقض نشود
1. Vercel Cron ممنوع (پلن Hobby فقط کران روزانه می‌دهد). همه زمان‌بندی‌ها pg_cron
   داخل Supabase که با pg_net به Edge Function ها HTTP می‌زند. کران‌ها UTC هستند؛
   بازار تهران شنبه‌تاچهارشنبه ۹:۰۰-۱۳:۰۰ تهران = ۵:۳۰-۹:۳۰ UTC.
2. RLS روی همه جدول‌ها فعال. نوشتن فقط با service_role (فقط در Edge Function / env).
   کلید anon فقط SELECT. service_role هرگز در کد فرانت یا git.
3. محاسبات اندیکاتور/متریک فقط روی کندل بسته‌شده (ضد repainting). منطق بک‌تست
   باید عیناً همان توابع lib/ منطق زنده را import کند — پیاده‌سازی موازی ممنوع.
4. آستانه‌های مبلغی (مثل پول درشت) پرسنتایلی، نه عدد ثابت تومانی (تورم).
5. هر collector: timeout + retry با backoff + ثبت وضعیت در pipeline_health.
   خطای یک منبع نباید بقیه را متوقف کند.
6. هر امتیاز/سیگنال باید تفکیک فاکتورهایش را ذخیره کند (jsonb reasons) — جعبه‌سیاه ممنوع.
7. LLM هرگز در مسیر صدور سیگنال نیست؛ فقط تفسیر زمینه (فاز ۶).
8. تاریخ در DB همیشه UTC/گرگوریان؛ در UI شمسی (date-fns-jalali).
9. در نمایش قیمت TSE همیشه هر دو: آخرین قیمت (pl) و قیمت پایانی (pc) — حجم مبنا
   این دو را جدا می‌کند.
10. commit های کوچک روی برنچ dev؛ merge به main فقط با تأیید کاربر.

## منابع دیتا
- بورس ایران: BrsApi.ir (env: BRSAPI_KEY) — قیمت، حجم، حقیقی/حقوقی، order book
- طلا/ارز ریالی: BrsApi (fallback: TGJU)
- جهانی: Yahoo Finance غیررسمی https://query1.finance.yahoo.com/v8/finance/chart/{symbol}
  (BZ=F برنت، GC=F انس، HG=F مس، DX-Y.NYB، ^GSPC) — پشت adapter تا تعویض آسان باشد
- تاریخی TSE: اسکریپت seed یک‌بارمصرف Python با pytse-client

## وضعیت فازها
- [x] فاز ۰: زیرساخت + تست روز صفر
- [ ] فاز ۱: پایپ‌لاین دیتا
- [ ] فاز ۲: موتور تابلوخوانی
- [ ] فاز ۳: موتور سیگنال + رتبه مرکب + بک‌تست
- [ ] فاز ۴: داشبورد UI
- [ ] فاز ۵: لایه ژئوپلیتیک + هشدار تلگرام
- [ ] فاز ۶: لایه AI (بریف روزانه)
(در پایان هر فاز این چک‌لیست را آپدیت کن.)
```

### ۲. اسکلت پروژه

- `npx create-next-app@latest` با TypeScript + Tailwind + App Router
- ساختار: `lib/` (منطق خالص قابل‌تست)، `supabase/functions/` (Edge Functions)، `supabase/migrations/`، `scripts/` (seed و backtest)
- `supabase init` و اتصال به پروژه من (من `SUPABASE_PROJECT_REF` و کلیدها را در env می‌گذارم)
- `.env.example` کامل + `.gitignore` درست (env ها هرگز commit نشوند)
- README با دستورهای setup

### ۳. تست روز صفر — مهم‌ترین کار این فاز

یک Edge Function حداقلی `ping-sources` بساز و deploy کن که:
- از BrsApi یک قیمت سهم بگیرد
- از Yahoo Finance قیمت BZ=F را بگیرد
- نتیجه (status، latency، نمونه پاسخ) را JSON برگرداند

بعد اجرایش کن و نتیجه را صریح گزارش بده. **اگر BrsApi از IP سرور Supabase بلاک بود، متوقف شو و به من بگو** — در آن صورت معماری collector ها به اسکریپت Node.js روی سرور ایرانی منتقل می‌شود (فقط محل اجرای fetch عوض می‌شود؛ DB و بقیه ثابت است). از همین حالا منطق fetch/transform را از منطق schedule جدا بنویس تا این جابه‌جایی ارزان باشد.

## Definition of Done

- ریپو با CLAUDE.md، اسکلت Next.js، supabase init، deploy موفق روی Vercel (صفحه ساده)
- خروجی ping-sources سبز برای هر دو منبع (یا گزارش صریح بلاک بودن + توقف)
- هیچ کلیدی در git نیست
