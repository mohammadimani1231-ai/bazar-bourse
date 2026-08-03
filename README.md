# داشبورد تحلیل بازار بورس ایران + جهانی

داشبورد شخصی تک‌کاربره برای تحلیل بازار بورس ایران و بازارهای جهانی. جزئیات معماری و قیدهای سخت پروژه در [CLAUDE.md](./CLAUDE.md).

## استک

- Next.js (App Router, TypeScript, Tailwind) — فقط UI، روی Vercel
- Supabase — Postgres, Edge Functions (Deno), pg_cron + pg_net, Realtime

## ساختار پوشه‌ها

```
app/                  صفحات و route handler های Next.js
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

یک job نگهداری هم هست: `quotes-retention` هر شب ساعت ۲ UTC، quotes قدیمی‌تر از ۹۰ روز را حذف می‌کند (سقف ۵۰۰MB پلن رایگان Supabase).

### seed تاریخی

```bash
# روی Python 3.12 (نه 3.14 — lxml برای آن هنوز wheel ندارد)
py -3.12 -m pip install -r scripts/requirements.txt
py -3.12 scripts/seed_history.py
```

۵ سال کندل روزانهٔ همهٔ نمادهای `watchlist` را از pytse-client می‌گیرد و در `daily_candles` upsert می‌کند (idempotent — می‌شود دوباره اجرا کرد).
