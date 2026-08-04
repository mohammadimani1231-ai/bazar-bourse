# فاز ۳ — موتور سیگنال + رتبه مرکب + بک‌تست (مهم‌ترین فاز پروژه)

قبل از شروع `CLAUDE.md` را بخوان. فازهای ۰-۲ کامل‌اند (تابلوخوانی اعتبارسنجی شده، ۵ سال daily_candles موجود است). **اول پلن کوتاه بده و تأیید بگیر.**

> قاعده طلایی این فاز: منطق بک‌تست و منطق زنده باید **عین یک کد** باشند (import از همان lib/). سیگنالی که بک‌تست نشده حدس است، نه سیگنال.

## ۱. اندیکاتورها — `lib/indicators.ts`

توابع خالص + unit test (مقایسه خروجی با مقادیر مرجع شناخته‌شده): EMA، RSI(14)، ROC(n)، PPO(12,26,9) با هیستوگرام. همه فقط روی کندل بسته‌شده (قید CLAUDE.md). محاسبه روی `adjusted_close`.

## ۲. رتبه تکنیکال مرکب (اقتباس از SCTR استاک‌چارتز)

نمره خام هر نماد:
- بلندمدت ۶۰٪: فاصله٪ از EMA200 (×۳۰٪) + ROC125 (×۳۰٪)
- میان‌مدت ۳۰٪: فاصله٪ از EMA50 (×۱۵٪) + ROC20 (×۱۵٪)
- کوتاه‌مدت ۱۰٪: شیب ۳روزه هیستوگرام PPO (×۵٪) + RSI14 (×۵٪)

سپس **رتبه پرسنتایلی ۰-۹۹ نسبت به کل نمادهای watchlist**. (پرسنتایلی بودن عمدی است: در بازار تورمی که همه‌چیز اسماً رشد می‌کند، رتبه نسبی معتبر می‌ماند.) محاسبه شبانه بعد از build-candles؛ ذخیره در جدول `composite_rank (symbol, date, rank, components jsonb)`.

## ۳. موتور قوانین سیگنال

قوانین به‌صورت **دیتا** نه کد:

```sql
create table signal_rules (
  id serial primary key,
  name text, definition jsonb, weight numeric,
  enabled bool default true
);
-- definition مثل: {"type":"cross","fast":"EMA9","slow":"EMA26","direction":"up"}
--             یا: {"type":"threshold","metric":"buyer_power","op":">","value":2}
```

قوانین اولیه (وزن اولیه پیشنهادی خودت را بگذار، بعداً با بک‌تست تنظیم می‌شود):
RSI14 اشباع فروش/خرید (۳۰/۷۰) • کراس EMA9/EMA26 • حجم مشکوک • قدرت خریدار > 2 • ورود پول حقیقی ۳ روز متوالی • فاصله از سقف/کف ۵۲ هفته • رتبه مرکب ≥ ۸۰

evaluator در `lib/signal-engine.ts`: جمع وزن‌دار قوانین فعال → score از ۱۰۰- تا ۱۰۰+. آستانه: خرید ≥ +۴۰، فروش ≤ −۴۰.

**گیت‌های الزامی قبل از صدور:**
- نماد در صف قفل‌شده → suppress (خرید در صف خرید عملاً ممکن نیست)
- اگر `market_regime != normal` (جدول settings — در فاز ۵ ساخته می‌شود؛ فعلاً default normal) → آستانه خرید +۶۰
- تفکیک کامل فاکتورها در reasons jsonb — امتیاز بدون توضیح ممنوع (قید CLAUDE.md)

```sql
create table signals (
  id bigserial primary key,
  symbol text, direction text,      -- buy | sell
  score numeric, reasons jsonb, regime text,
  created_at timestamptz default now()
);

-- کارنامه: پاسخگویی سیگنال (مدل سهمتو)
create table signal_outcomes (
  signal_id bigint references signals(id),
  return_1d numeric, return_5d numeric, return_20d numeric,
  evaluated_at timestamptz
);
```

Edge Function `compute-signals` هر ۱۰ دقیقه در ساعات بازار + job شبانه پر کردن signal_outcomes.

## ۴. بک‌تست — `scripts/backtest.ts`

CLI: `npm run backtest -- --from 2021-01-01 --rules default`

- روی daily_candles، با **همان** lib/indicators و lib/signal-engine
- شبیه‌سازی واقع‌گرایانه: کارمزد ~۱.۵٪ رفت‌وبرگشت؛ قید صف: اگر روز سیگنال نماد صف بود، ورود روز بعد یا از دست رفتن معامله؛ ورود با قیمت open روز بعد از سیگنال (نه close همان روز — look-ahead bias ممنوع)
- خروجی گزارش HTML + JSON:
  - equity curve در برابر **سه بنچمارک: شاخص کل، دلار آزاد، طلای ۱۸** (بازده اسمی ریالی گمراه‌کننده است)
  - max drawdown + مدت + زمان recovery + نمودار underwater
  - win rate **همیشه کنار** profit factor و تعداد معامله؛ expectancy؛ Sharpe و Sortino سالانه‌شده
  - جدول عملکرد به تفکیک هر قانون (کدام قانون ارزش افزوده دارد)
  - نقاط ورود/خروج روی چارت قیمت نمونه

## Definition of Done

- unit test های indicators و signal-engine سبز
- گزارش بک‌تست ۵ ساله تولید و به من ارائه شده — **اگر استراتژی پیش‌فرض از buy-and-hold شاخص بدتر است، صادقانه همین را بنویس؛** دستکاری نتایج بدترین باگ ممکن است
- سیگنال‌های زنده با تفکیک فاکتور در جدول signals ثبت می‌شوند
- چک‌لیست فاز ۳ در CLAUDE.md تیک بخورد
