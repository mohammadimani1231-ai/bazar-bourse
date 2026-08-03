# فاز ۱ — پایپ‌لاین دیتا

قبل از شروع `CLAUDE.md` را بخوان و قیدهای سخت را رعایت کن. فاز ۰ کامل است (تست روز صفر پاس شده). **اول پلن کوتاه بده و تأیید بگیر.**

## هدف

جمع‌آوری خودکار و مقاوم دیتای بورس ایران + بازارهای جهانی در Supabase، با زمان‌بندی pg_cron.

## ۱. Migration جدول‌ها

```sql
create table watchlist (
  id serial primary key,
  symbol text unique not null,          -- فولاد، فملی، ...
  ins_code text,                        -- کد TSETMC
  industry text,                        -- گروه صنعت
  market text default 'tse'
);

-- اسنپ‌شات لحظه‌ای؛ هر ۲ دقیقه در ساعات بازار
create table quotes (
  id bigserial primary key,
  symbol text not null,
  last_price numeric, close_price numeric,   -- pl و pc — هر دو الزامی
  volume bigint, value numeric, trade_count int,
  buy_i_volume bigint, buy_n_volume bigint,  -- حجم خرید حقیقی/حقوقی
  sell_i_volume bigint, sell_n_volume bigint,
  buy_count_i int, sell_count_i int,         -- تعداد کد حقیقی
  bid1_price numeric, bid1_volume bigint,    -- سرخط خرید
  ask1_price numeric, ask1_volume bigint,
  price_max numeric, price_min numeric,      -- سقف/کف مجاز روز
  base_volume bigint,                        -- حجم مبنا
  captured_at timestamptz default now()
);
create index on quotes (symbol, captured_at desc);

create table daily_candles (
  symbol text, date date,
  open numeric, high numeric, low numeric, close numeric, final_price numeric,
  volume bigint, value numeric,
  buy_i_volume bigint, sell_i_volume bigint, buy_count_i int, sell_count_i int,
  adjusted_close numeric,        -- تعدیل‌شده برای افزایش سرمایه/سود نقدی
  primary key (symbol, date)
);

create table global_quotes (
  id bigserial primary key,
  asset text not null,   -- brent, gold_ounce, copper, dxy, sp500, usd_irr, gold_18k, coin_emami
  price numeric, change_pct numeric,
  captured_at timestamptz default now()
);

create table pipeline_health (
  id bigserial primary key,
  source text, status text,      -- ok | error | timeout
  detail text, latency_ms int,
  checked_at timestamptz default now()
);
```

RLS طبق CLAUDE.md روی همه.

## ۲. Edge Function ها

- `collect-tse`: نمادهای watchlist را از BrsApi می‌گیرد → quotes. (batch اگر API اجازه می‌دهد؛ وگرنه sequential با فاصله کوتاه)
- `collect-global`: Yahoo (برنت، انس، مس، DXY، S&P500) + طلا/ارز ریالی BrsApi → global_quotes
- `build-candles`: از quotes روز، کندل روزانه می‌سازد و در daily_candles upsert می‌کند. ستون adjusted_close فعلاً = close (تعدیل در فاز بعد که دیتای corporate action داشتیم؛ ستون از الان باشد)
- `health-check`: اگر جدیدترین quote در ساعات بازار قدیمی‌تر از ۱۵ دقیقه بود → ثبت error در pipeline_health

هر چهار تابع: timeout، retry با backoff، ثبت ok/error در pipeline_health.

## ۳. زمان‌بندی pg_cron (SQL در migration یا فایل جدا + مستند در README)

- collect-tse: هر ۲ دقیقه، `*/2 5-9 * * 6,0,1,2,3` (شنبه‌تاچهارشنبه، پوشش ۵:۲۰-۹:۴۰ UTC کافی است)
- collect-global: هر ۱۵ دقیقه، ۲۴/۷
- build-candles: `30 10 * * 6,0,1,2,3`
- health-check: هر ۱۰ دقیقه در ساعات بازار
- retention: job شبانه حذف quotes قدیمی‌تر از ۹۰ روز (سقف ۵۰۰MB پلن رایگان)

## ۴. Seed تاریخی

`scripts/seed_history.py` با pytse-client: ۵ سال کندل روزانه نمادهای watchlist → daily_candles (upsert، idempotent). لیست اولیه watchlist را از من بپرس (حدود ۳۰-۵۰ نماد شاخص از گروه‌های پالایشی، پتروشیمی، فلزات، بانک، خودرو).

## Definition of Done

- بعد از یک روز معاملاتی: quotes پر می‌شود، global_quotes آپدیت است، health-check سبز
- seed تاریخی اجرا شده و `select count(*) from daily_candles` معقول است
- unit test برای توابع transform (پاسخ خام API → سطر جدول)
- چک‌لیست فاز ۱ در CLAUDE.md تیک بخورد
