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
| `npx supabase db push` | اجرای مایگریشن‌های `supabase/migrations/` |
| `npx supabase functions deploy <name>` | deploy یک Edge Function |
