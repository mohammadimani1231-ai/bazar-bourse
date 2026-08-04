# فاز ۵ — لایه ژئوپلیتیک + هشدار تلگرام

قبل از شروع `CLAUDE.md` را بخوان. فازهای ۰-۴ کامل‌اند. **اول پلن کوتاه بده و تأیید بگیر.**

## چرا این فاز

بازار ایران به‌شدت خبر-محور است (تنش/توافق ایران-آمریکا-اسرائیل، تحریم، مذاکره). اصل معماری: **سیاست به «داده ورودی» تبدیل می‌شود، نه به «نظر مدل»**. سه مکانیزم:

## ۱. tension_index — دماسنج کمّی تنش

بازار خودش تنش را سریع‌تر از خبرگزاری قیمت‌گذاری می‌کند. Edge Function (داخل collect-global یا جدا، هر ۱۵ دقیقه):

- z-score نوسان روزانه دلار آزاد نسبت به توزیع ۹۰ روز اخیر
- حباب سکه امامی: (قیمت سکه − ارزش ذاتی طلای آن) ÷ ارزش ذاتی — ارزش ذاتی از انس جهانی × نرخ دلار × وزن طلای سکه (۸.۱۳۳ گرم، عیار ۹۰۰)
- z-score تغییر روزانه برنت

میانگین وزنی این سه → tension_index (ذخیره در global_quotes با asset='tension_index'). نمایش به‌صورت gauge در نمای کلی.

## ۲. پایپ‌لاین خبر

- Edge Function ساعتی `collect-news`: چند فید RSS (اقتصادی فارسی + بین‌المللی؛ لیست feed ها configurable در جدول settings)
- فیلتر کلیدواژه: مذاکره، توافق، تحریم، حمله، برجام، جنگ، آتش‌بس + کلیدواژه‌های configurable
- ذخیره در `news_items (id, title, source, url, matched_keywords text[], published_at)` با dedupe روی url
- نمایش: مارکرهای رویداد روی چارت‌های صفحه نماد و نمای جهانی (دایره رنگی روی محور زمان، کلیک → تیتر و لینک) + فید اخبار در نمای کلی

## ۳. سوییچ دستی market_regime

- جدول `settings (key, value)` با کلید market_regime: `normal` / `war_risk` / `agreement_hope`
- UI: سوییچ در نمای کلی (فقط من می‌بینم، پس ساده)
- اثر سیستمی (از فاز ۳ آماده است): در رژیم غیر normal آستانه سیگنال خرید +۶۰ می‌شود + بنر هشدار در همه صفحات: «رژیم بازار: تنش — اعتبار سیگنال‌های تکنیکال کاهش‌یافته»

## ۴. هشدار تلگرام

Bot API (env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) — طراحی ضد نویز، وگرنه هشدارها را بی‌صدا می‌کنم و کل ماژول بی‌ارزش می‌شود:

```sql
create table alert_rules (
  id serial primary key,
  name text, condition jsonb,
  severity text,          -- action | info
  fire_policy text,       -- once | once_per_bar_close | cooldown
  cooldown_minutes int,
  enabled bool default true
);
create table alert_log (
  id bigserial primary key,
  rule_id int, fired_at timestamptz, payload jsonb, delivered bool
);
```

- **پیش‌فرض fire_policy: once_per_bar_close** (شلیک وسط کندل ممنوع — ضد flicker)
- دو سطح: **action** (سیگنال جدید، جهش tension_index بالای آستانه، مرگ پایپ‌لاین از health-check) → پیام فوری؛ **info** (حجم مشکوک، پول درشت، کد به کد) → دایجست ساعتی: همه در **یک** پیام جمع شوند
- هشدارهای مرتبط همزمان (چند نماد یک گروه) در یک پیام گروه‌بندی شوند
- قالب پیام: مختصر، فارسی، با لینک مستقیم به صفحه نماد در داشبورد

## Definition of Done

- tension_index محاسبه و در نمای کلی نمایش داده می‌شود؛ روی دیتای تاریخی یک sanity-check: در روزهای تنش شناخته‌شده گذشته باید بالا بوده باشد (اگر دیتای تاریخی دلار/سکه در دسترس است)
- news_items پر می‌شود و مارکرها روی چارت می‌آیند
- سوییچ رژیم کار می‌کند و اثرش روی آستانه سیگنال تست شده
- یک هشدار action و یک دایجست info واقعی در تلگرام من رسیده
- چک‌لیست فاز ۵ در CLAUDE.md تیک بخورد
