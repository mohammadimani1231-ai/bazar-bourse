# فاز ۲ — موتور تابلوخوانی (متریک‌های خاص بازار ایران)

قبل از شروع `CLAUDE.md` را بخوان. فازهای ۰ و ۱ کامل‌اند (پایپ‌لاین دیتا کار می‌کند و quotes چند روز دیتا دارد). **اول پلن کوتاه بده و تأیید بگیر.**

## هدف

ماژول خالص و تست‌شده‌ی محاسبه متریک‌های تابلوخوانی + job دوره‌ای ذخیره آن‌ها.

## ۱. ماژول `lib/tabloo.ts`

توابع خالص (ورودی: سطرهای quotes/daily_candles؛ خروجی: عدد یا آبجکت ساده) — **با unit test کامل** چون فاز ۳ (سیگنال و بک‌تست) عیناً همین توابع را import می‌کند:

1. **سرانه خرید حقیقی** = (buy_i_volume × close_price) ÷ buy_count_i — و سرانه فروش مشابه
2. **قدرت خریدار حقیقی** = سرانه خرید ÷ سرانه فروش (گارد تقسیم بر صفر)
3. **ورود/خروج پول حقیقی** = (buy_i_volume − sell_i_volume) × close_price — و تجمیع per-industry
4. **حجم مشکوک**: volume > avg(3m) AND volume > 2 × avg(12m) — میانگین‌ها از daily_candles
5. **پول درشت**: سرانه خریدار جدید بالای پرسنتایل ۹۰ توزیع ۳۰ روز اخیر همان نماد (پرسنتایلی، نه تومان ثابت — قید CLAUDE.md)
6. **کد به کد حقوقی→حقیقی**: buy_i_volume > 0.5×volume AND sell_n_volume > 0.5×volume — خروجی فقط پرچم اطلاع‌رسان؛ در docstring صریح بنویس «هرگز سیگنال مستقل نیست»
7. **وضعیت صف**: locked_buy اگر bid1_price == price_max؛ heavy اگر bid1_volume ≥ base_volume؛ و «سرعت صف»: نرخ تغییر bid1_volume/ask1_volume بین دو اسنپ‌شات متوالی (تشخیص صف در حال جمع شدن)
8. **سرانه تجمیعی بازار**: سری زمانی سرانه خرید و فروش کل بازار در طول جلسه + تشخیص کراس (تقاطع این دو خط در حین بازار، event مهم رژیمی است)

## ۲. ذخیره‌سازی

```sql
create table tabloo_metrics (
  id bigserial primary key,
  symbol text not null,            -- یا 'MARKET' برای متریک‌های کل بازار
  metric text not null,            -- buyer_power, money_flow, whale, code_to_code, queue_state, ...
  value numeric,
  meta jsonb,                      -- جزئیات (مثلاً اجزای محاسبه)
  captured_at timestamptz default now()
);
create index on tabloo_metrics (symbol, metric, captured_at desc);
```

Edge Function جدید `compute-tabloo`: هر ۱۰ دقیقه در ساعات بازار (pg_cron)، آخرین اسنپ‌شات‌های quotes را می‌خواند، متریک‌ها را می‌سازد، در tabloo_metrics می‌نویسد. خطاها → pipeline_health.

## ۳. اعتبارسنجی — بخش لازم فاز، نه اختیاری

برای ۳ نماد پرمعامله (مثلاً فولاد، فملی، شستا) در یک روز معاملاتی، مقادیر سرانه/قدرت خریدار/ورود پول محاسبه‌شده را با مقادیر نمایش‌داده‌شده در سایت‌های مرجع (livetse.ir یا rahavard365) مقایسه کن و جدول مقایسه را به من گزارش بده. اختلاف بیش از ~۵٪ یعنی باگ در mapping فیلدهای BrsApi — قبل از بستن فاز حل شود.

## Definition of Done

- unit test های lib/tabloo.ts سبز (شامل edge case ها: حجم صفر، count صفر، نماد بسته)
- tabloo_metrics در یک روز معاملاتی پر می‌شود
- جدول اعتبارسنجی ۳ نماد ارائه و تأیید شده
- چک‌لیست فاز ۲ در CLAUDE.md تیک بخورد
