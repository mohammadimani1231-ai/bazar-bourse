# داشبورد تحلیل بازار بورس ایران + جهانی

داشبورد شخصی تک‌کاربره برای تحلیل بازار بورس ایران و بازارهای جهانی. جزئیات معماری و قیدهای سخت پروژه در [CLAUDE.md](./CLAUDE.md).

## استک

- Next.js (App Router, TypeScript, Tailwind) — فقط UI، روی Vercel
- Supabase — Postgres, Edge Functions (Deno), pg_cron + pg_net, Realtime

## ساختار پوشه‌ها

```
app/                  صفحات و route handler های Next.js
components/           کامپوننت‌های React مشترک بین صفحات (چارت‌ها، جدول‌ها، فرم‌ها)
lib/                  منطق خالص و قابل‌تست (اندیکاتور، سیگنال، آداپتور منابع دیتا)
supabase/functions/   Edge Functions (Deno/TS)
supabase/migrations/  مایگریشن‌های دیتابیس
scripts/              اسکریپت‌های یک‌بارمصرف (seed تاریخی، بک‌تست)
prompts/              پرامپت‌های هر فاز پروژه
```

## راه‌اندازی

### ۱. نصب وابستگی‌ها

```bash
npm install
```

### ۲. متغیرهای محیطی

```bash
cp .env.example .env.local
```

مقادیر را در `.env.local` پر کن (هرگز commit نشود — در `.gitignore` است):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — از داشبورد پروژهٔ Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — فقط سمت سرور، هرگز در باندل کلاینت
- `SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN` — برای `supabase link` و deploy از CLI
- `BRSAPI_KEY` — برای Edge Functionها، جدا با `supabase secrets set` تنظیم می‌شود

### ۳. اتصال Supabase CLI به پروژه

```bash
npx supabase login
npx supabase link --project-ref $SUPABASE_PROJECT_REF
```

### ۴. تنظیم secrets برای Edge Functions

```bash
npx supabase secrets set BRSAPI_KEY=your_key_here
```

### ۵. اجرای دولوپمنت سرور Next.js

```bash
npm run dev
```

باز کن: [http://localhost:3000](http://localhost:3000)

### ۶. Deploy یک Edge Function

```bash
npx supabase functions deploy ping-sources
```

### ۷. تست Edge Function

```bash
curl -i "https://<project-ref>.supabase.co/functions/v1/ping-sources" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

## دستورهای مفید

| دستور | کاربرد |
|---|---|
| `npm run dev` | دولوپمنت سرور Next.js |
| `npm run build` | build پروداکشن |
| `npm run lint` | ESLint (`next build` دیگر لینت نمی‌زند) |
| `npm test` | اجرای unit testهای Vitest برای `lib/` |
| `npx supabase db push` | اجرای مایگریشن‌های `supabase/migrations/` |
| `npx supabase functions deploy <name>` | deploy یک Edge Function |

## پایپ‌لاین دیتا (فاز ۱)

چهار Edge Function با pg_cron زمان‌بندی شده‌اند (`supabase/migrations/*_stage01b_pg_cron_schedule.sql`):

| Function | زمان‌بندی (UTC) | کار |
|---|---|---|
| `collect-tse` | هر ۲ دقیقه، ۵-۹، شنبه‌تاچهارشنبه | یک درخواست بالک `AllSymbols` از BrsApi → `quotes` |
| `collect-global` | هر ۱۵ دقیقه، ۲۴/۷ | Yahoo (برنت/انس/مس/DXY/S&P500) + BrsApi طلا/ارز → `global_quotes` |
| `build-candles` | ۱۰:۳۰، شنبه‌تاچهارشنبه | از `quotes` روز، کندل روزانه در `daily_candles` upsert می‌کند |
| `health-check` | هر ۱۰ دقیقه، ۵-۹، شنبه‌تاچهارشنبه | اگر آخرین quote قدیمی‌تر از ۱۵ دقیقه بود، در `pipeline_health` خطا ثبت می‌کند |
| `compute-tabloo` | هر ۱۰ دقیقه، ۵-۹، شنبه‌تاچهارشنبه | متریک‌های `lib/tabloo.ts` را از آخرین quotes می‌سازد → `tabloo_metrics` (فاز ۲) |
| `compute-rank` | ۱۰:۴۰، شنبه‌تاچهارشنبه | رتبهٔ فنی مرکب (`lib/composite-rank.ts`) هر نماد → `composite_rank` (فاز ۳) |
| `compute-signals` | هر ۱۰ دقیقه، ۵-۹، شنبه‌تاچهارشنبه | ارزیابی قوانین فعال `signal_rules` (`lib/signal-engine.ts`) → `signals` (فاز ۳) |
| `evaluate-signal-outcomes` | ۱۰:۴۵، شنبه‌تاچهارشنبه | بازده ۱/۵/۲۰ روزهٔ سیگنال‌های اخیر → `signal_outcomes` (فاز ۳) |

یک job نگهداری هم هست: `quotes-retention` هر شب ساعت ۲ UTC، quotes قدیمی‌تر از ۹۰ روز را حذف می‌کند (سقف ۵۰۰MB پلن رایگان Supabase).

همهٔ این Functionها اول `lib/market-status.ts` را چک می‌کنند (قید CLAUDE.md #11) و اگر بازار
واقعاً باز نباشد (نه فقط بر اساس روز هفته) ساکت با `status='market_closed'` خارج می‌شوند —
جدول `market_holidays (date, title)` را برای تعطیلات رسمی/مذهبی هرسال دستی پر کن.

### seed تاریخی

```bash
# روی Python 3.12 (نه 3.14 — lxml برای آن هنوز wheel ندارد)
py -3.12 -m pip install -r scripts/requirements.txt
py -3.12 scripts/seed_history.py
```

۵ سال کندل روزانهٔ همهٔ نمادهای `watchlist` را از pytse-client می‌گیرد و در `daily_candles` upsert می‌کند (idempotent — می‌شود دوباره اجرا کرد).

### backfill حقیقی/حقوقی (فاز ۲ — پیش‌نیاز متریک «پول درشت»)

از `BrsApi Tsetmc/History.php?type=1` (تاریخ‌های Jalali → میلادی تبدیل می‌شوند) ستون‌های
`buy_i_volume`/`sell_i_volume`/`buy_count_i`/`sell_count_i` را برای ~۱۳۰ روز اخیر هر نماد در
`daily_candles` merge می‌کند — بدون این ستون‌ها، متریک «پول درشت» تا وقتی پایپ‌لاین زنده به‌اندازهٔ
کافی داده جمع نکند (۳۰ روز معاملاتی) خروجی «داده ناکافی» می‌دهد.

⚠️ این endpoint از IP بعضی محیط‌های ابری (مثل sandbox اجرای Claude Code) توسط BrsApi ریست می‌شود.
دو راه اجرا:

```bash
# راه ۱: لوکال (روی شبکهٔ معمولی/خانگی معمولاً مشکلی ندارد)
py -3.12 scripts/backfill_buyer_breakdown.py

# راه ۲: از IP خود Supabase (وقتی راه ۱ با connection reset مواجه شد)
npx supabase functions deploy backfill-buyer-breakdown
curl -X POST "https://<project-ref>.supabase.co/functions/v1/backfill-buyer-breakdown" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

هر دو idempotent‌اند (upsert جزئی روی `symbol,date` — ستون‌های OHLCV موجود دست‌نخورده می‌مانند).

## موتور تابلوخوانی (فاز ۲)

`lib/tabloo.ts` — توابع خالص و تست‌شده برای سرانه خرید/فروش حقیقی، قدرت خریدار، ورود/خروج پول
(per-symbol و per-industry)، حجم مشکوک، پول درشت (پرسنتایلی)، کد‌به‌کد (فقط پرچم اطلاع‌رسان)،
وضعیت/سرعت صف، و سرانه تجمیعی بازار + تشخیص کراس.

Edge Function `compute-tabloo` هر ۱۰ دقیقه در ساعات بازار این متریک‌ها را از آخرین `quotes` می‌سازد
و در `tabloo_metrics` می‌نویسد (`symbol='MARKET'` برای متریک‌های کل بازار، نام صنعت برای
`money_flow_industry`).

## موتور سیگنال + بک‌تست (فاز ۳)

`lib/indicators.ts` (EMA, RSI Wilder, ROC, PPO+هیستوگرام, فاصله از ۵۲هفته — تست‌شده در برابر
مقادیر مرجع pandas)، `lib/composite-rank.ts` (رتبهٔ SCTR-مانند، پرسنتایلی)، `lib/signal-engine.ts`
(evaluator قوانین jsonb-محور از جدول `signal_rules`) — همهٔ این‌ها هم در Edge Functionهای زنده و
هم در `scripts/backtest.ts` عیناً import می‌شوند (بدون پیاده‌سازی موازی).

### بک‌فیل بنچمارک تاریخی (پیش‌نیاز بک‌تست)

```bash
py -3.12 scripts/backfill_benchmarks.py
# اگر Gold_Currency_Pro از IP لوکال ریست شد:
npx supabase functions deploy backfill-benchmarks
curl -X POST ".../functions/v1/backfill-benchmarks" -H "Authorization: Bearer $ANON_KEY"
```

شاخص کل (pytse-client) + دلار آزاد/طلای ۱۸ عیار (BrsApi Gold_Currency_Pro) را در
`benchmark_candles` می‌ریزد.

### اجرای بک‌تست

```bash
npm run backtest -- --from 2021-01-01
```

روی `daily_candles`، ورود با open روز بعد از سیگنال (ضد look-ahead)، کارمزد ۱.۵٪ رفت‌وبرگشت،
اندازهٔ پوزیشن ۱۰٪ سرمایه (حداکثر ۱۰ هم‌زمان)، خروج با سیگنال sell یا حداکثر ۲۰ روز نگه‌داری.
گزارش HTML+JSON در `backtest-reports/` (gitignore شده — نتایج تولیدی‌اند، نه سورس).

**نتیجهٔ فعلی صادقانه در CLAUDE.md ثبت شده: با قوانین اولیه استراتژی به‌شدت زیان‌ده بود؛ بعد از
تنظیم وزن بر همان دادهٔ بک‌تست، زیان به تقریباً صفر رسید ولی هنوز به‌شدت از buy-and-hold عقب است
و نمونهٔ معاملات برای نتیجه‌گیری آماری خیلی کوچک است.**

## داشبورد UI (فاز ۴)

شش صفحه: `/` (نمای کلی — نوار جهانی، treemap ارزش معاملات/ورود پول، رتبه‌بندی صنایع)،
`/symbol/[symbol]` (کندل + سری‌زمانی درون‌روز + وضعیت صف + تاریخچهٔ سیگنال)،
`/signals` (جدول زنده + تب کارنامه)، `/screener` (فیلتر دراپ‌داون/اسلایدر + preset + افزودن به واچ‌لیست)،
`/global` (rebase-به-۱۰۰ + heatmap همبستگی + lead-lag CCF)، `/health` (وضعیت پایپ‌لاین + حجم دیتابیس).

فارسی/RTL، فونت Vazirmatn، دارک‌مود (تنها حالت، بدون سوییچ)، `lightweight-charts` برای کندل،
`echarts` برای treemap/heatmap/سری‌زمانی، `date-fns-jalali` برای تاریخ (با تبدیل timezone-safe در
`lib/jalali.ts` — به‌جای دستکاری offset، از `Intl.DateTimeFormat` + الگوی «ساعت دیواری» استفاده می‌کند
تا مستقل از timezone ماشین اجرا درست باشد). قیمت (`quotes`) و سیگنال (`signals`) با Supabase Realtime
بدون رفرش آپدیت می‌شوند؛ بقیهٔ دیتا (تابلوخوانی، رتبه) با هر ناوبری صفحه تازه می‌شود.

### دو نکتهٔ فنی مهم (برای فازهای بعد)

- همهٔ صفحات دیتای زنده باید `export const dynamic = "force-dynamic"` داشته باشند، وگرنه
  Next.js آن‌ها را در build-time به static prerender تبدیل می‌کند و دیتا را تا deploy بعدی منجمد نگه می‌دارد.
- کوئری Supabase/PostgREST سقف پیش‌فرض **۱۰۰۰ ردیف** دارد و `.limit()` بزرگ‌تر را ساکت نادیده می‌گیرد —
  برای هر کوئری‌ای که ممکن است بیش از ۱۰۰۰ ردیف برگرداند (تاریخچهٔ چندسالهٔ چند دارایی با هم، مثلا)
  باید با `.range()` صفحه‌بندی کرد (نمونه: `fetchAllPages` در `app/global/page.tsx`).

جزئیات کامل (شکاف‌های اسکیما نسبت به پرامپت فاز ۴ و نحوهٔ جایگزینی‌شان) در چک‌لیست فاز ۴ در CLAUDE.md.

## لایه ژئوپلیتیک + هشدار تلگرام (فاز ۵)

- `compute-tension` (هر ۱۵ دقیقه) → شاخص تنش (gauge ۰-۱۰۰ در نمای کلی)، از z-score نوسان دلار +
  حباب سکه امامی + z-score تغییر برنت.
- `collect-news` (ساعتی) → `news_items`، فیدهای RSS واقعی (فارسی+بین‌المللی، لیستشان در
  `settings.news_feeds`) فیلترشده با کلیدواژه (`settings.news_keywords`) — هر دو در دیتابیس
  configurable، نه هاردکد. مارکر اخبار روی چارت کندل صفحهٔ نماد و چارت rebase نمای جهانی (کلیک → لینک خبر).
- `settings(market_regime)` — سوییچ در نمای کلی، بنر در همهٔ صفحات، وصل به آستانهٔ سیگنال در `compute-signals`.
- هشدار تلگرام: `evaluate-alerts` (۱۰دقیقه‌ای، action: سیگنال جدید/جهش تنش/مرگ پایپ‌لاین → فوری) +
  `send-alert-digest` (ساعتی، info: حجم مشکوک/پول درشت/کد‌به‌کد → همه در یک پیام). قوانین در
  `alert_rules`، تاریخچه در `alert_log`.

### راه‌اندازی بات تلگرام

```bash
# ۱. به @BotFather پیام بده → /newbot → توکن را بگیر
# ۲. به بات خودت پیام بده، بعد chat id را از این URL بگیر:
curl "https://api.telegram.org/bot<TOKEN>/getUpdates"

npx supabase secrets set TELEGRAM_BOT_TOKEN=your_token TELEGRAM_CHAT_ID=your_chat_id
```

بدون این دو secret، `evaluate-alerts`/`send-alert-digest` طبیعی کار می‌کنند (قانون trigger می‌شود،
در `alert_log` ثبت می‌شود) ولی `delivered=false` می‌ماند — خطا نمی‌دهند، فقط ارسال واقعی رخ نمی‌دهد.

اجرای دستی دایجست روی یک بازهٔ دلخواه (مثلاً کل جلسهٔ معاملاتی، بعد از بسته‌شدن بازار):

```bash
curl -X POST ".../functions/v1/send-alert-digest" \
  -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"sinceMinutes": 720}'
```

### دو باگ کشف‌شده حین این فاز

**۱. واحد تومان/ریال:** BrsApi `Gold_Currency.php` واحد ارز (`currency`) را به تومان برمی‌گرداند ولی
طلا/سکه (`gold`) را به ریال — یک ناسازگاری واقعی در خود API. از فاز ۱ تا این فاز
`global_quotes.usd_irr` ده برابر کوچک‌تر از واقعیت بود (تیکر «دلار آزاد» در نمای کلی هم همینطور).
رفع شد در `lib/transforms/globalQuote.ts` + مایگریشن یک‌بارهٔ اصلاح دادهٔ قبلی.

**۲. حلقهٔ هشدار خودارجاع:** `evaluate-alerts` گاهی سر ساعت (هم‌زمانی چند کرون) با
`JWT issued at future` خطا می‌خورد و ۱۰ دقیقه بعد خودش خطای خودش را به‌عنوان «مرگ پایپ‌لاین» گزارش
می‌کرد — هر ساعت یک هشدار کاذب. حالا قانون `pipeline_health` فقط سورس‌هایی را گزارش می‌کند که
**آخرین وضعیتشان** خطاست (نه هر خطای گذرا)، و خودش از این چک مستثنا شده.

جزئیات کامل هر دو در چک‌لیست فاز ۵ در CLAUDE.md.

## لایه AI — بریف روزانه (فاز ۶)

`daily-brief` (کرون `0 5 * * 6,0,1,2,3` UTC = ۸:۳۰ تهران، قبل بازگشایی) یک JSON ساخت‌یافته از ۷
بخش دیتابیس می‌سازد (global، domestic، tension_index/market_regime، market، signals، news،
correlation_breaks)، با Claude (`claude-sonnet-5`) تحلیل می‌کند، خروجی را با zod اعتبارسنجی
می‌کند (یک retry خودکار)، و در `ai_briefs` ذخیره می‌کند. LLM هرگز سیگنال صادر نمی‌کند — فقط زمینه
تفسیر می‌کند (طبق قید معماری پروژه).

نمایش: کارت خلاصه در نمای کلی + آرشیو کامل در `/briefs` با برچسب اطمینان رنگی و tooltip روی هر
ادعا که دادهٔ خام پشتش را نشان می‌دهد. دکمهٔ «توضیح بده» در `/signals` فاکتورهای هر سیگنال را به
فارسی ساده ترجمه می‌کند — **بدون LLM**، فقط template متنی (`lib/signalExplain.ts`).

### راه‌اندازی

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

نیاز به billing/credit فعال در حساب Anthropic دارد (Plans & Billing در console.anthropic.com)،
وگرنه فراخوانی با خطای واضح «credit balance too low» شکست می‌خورد (نه توهم/پاسخ ساختگی).

### نکتهٔ فنی: zod در Deno

`lib/briefSchema.ts` بین Next.js و Edge Function مشترک است و `zod` را بدون پیشوند import می‌کند
(`import { z } from "zod"`) تا سمت Next.js عادی کار کند. برای اینکه Deno هم همین import بدون‌پیشوند
را بشناسد، `supabase/functions/deno.json` یک import map دارد (`"zod": "npm:zod@^4"`) که در
`config.toml` زیر `[functions.daily-brief]` وصل شده — روی هر `deploy` بعدی خودکار اعمال می‌شود.

## ماژول گزارش‌گیری تحلیلی (فاز ۷)

دو نوع گزارش عمیق HTML ذخیره‌شده در جدول `reports`، مکمل بریف ۲۵۰ کلمه‌ای فاز ۶:

- **گزارش هفتگی جامع بازار** — خودکار، `weekly-report` (کرون پنجشنبه ۱۰:۰۰ تهران): بازار در یک
  نگاه، جریان پول، زمینهٔ جهانی، رژیم و تنش، کارنامهٔ موتور سیگنال، هفتهٔ پیش رو، رتبه‌بندی واچ‌لیست،
  و یک خلاصهٔ اجرایی LLM. لینک گزارش جدید با پیام تلگرام اعلام می‌شود.
- **گزارش عمیق تک‌نماد** — درخواستی، دکمهٔ «تولید گزارش عمیق نماد» در صفحهٔ هر نماد
  (`generateSymbolReport` در `app/symbol/[symbol]/actions.ts`، Server Action): پروفایل، عملکرد
  قیمت (adjusted + نمای دلاری)، تابلوخوانی ۳۰ روزه، رفتار صف، تاریخچهٔ سیگنال، همبستگی با
  برنت/دلار/انس (CCF و لگ بهینه)، فصلی‌نگری ماه شمسی، و جمع‌بندی LLM.

هر عدد در گزارش مستقیم از دیتابیس است؛ LLM فقط در خلاصهٔ اجرایی دخالت دارد و اگر Anthropic API در
دسترس نباشد آن بخش با یک پاراگراف صریح حذف می‌شود و بقیهٔ گزارش سالم می‌ماند. آرشیو کامل با فیلتر
نوع/جستجوی نماد و دکمهٔ چاپ (print-friendly، بدون وابستگی JS کلاینتی) در `/reports`.

برای اینکه گزارش تک‌نماد (که از سمت Next.js روی Vercel اجرا می‌شود، نه Edge Function) خلاصهٔ LLM
داشته باشد، `ANTHROPIC_API_KEY` باید جدا در env variables پروژهٔ Vercel هم ست شود (کلید فعلی فقط
در Supabase secrets است، که برای `weekly-report` کافی است).
