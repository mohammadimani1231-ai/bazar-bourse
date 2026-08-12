-- Auto Paper-Trading — پرتفوی مجازی خودکار (بخش ۱)
-- تحت تأثیر: virtual_portfolio, virtual_trades
-- کاملاً جدا از paper_trades دستی فاز ۸ (دو مفهوم متفاوت: تمرین دستی کاربر در برابر
-- راستی‌آزمایی خودکار سیستم — قانون #۱۴ CLAUDE.md، جریان یک‌طرفه).
-- Rollback:
--   drop table if exists virtual_trades cascade;
--   drop table if exists virtual_portfolio cascade;

create table if not exists virtual_portfolio (
  id int primary key default 1,
  initial_capital numeric not null default 100000000,   -- ۱۰۰ میلیون تومان
  -- فقط cache نمایشی: منبع حقیقتِ نقد، خودِ virtual_trades است و هر اجرا از آنجا بازمحاسبه
  -- و اینجا بازنویسی می‌شود (تا شکست نیمه‌کارهٔ یک اجرا موجودی را برای همیشه خراب نکند).
  cash numeric not null default 100000000,
  -- نرخ واقعی بورس تهران (۱۴۰۵): خرید ~۰.۳۷٪، فروش ~۰.۸۸٪ + ۰.۵٪ مالیات فروش = ۱.۳۸٪
  -- جمع رفت‌وبرگشت ~۱.۷۵٪. عمداً از ROUND_TRIP_FEE=۱.۵٪ در scripts/backtest.ts جداست
  -- (آنجا برای مقایسه‌پذیری گزارش‌های تاریخی دست‌نخورده مانده) — قانون #۱۴ CLAUDE.md.
  buy_fee_pct numeric not null default 0.37,
  sell_fee_pct numeric not null default 1.38,
  max_hold_days int not null default 20,
  queue_wait_days int not null default 3,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (id = 1)
);
insert into virtual_portfolio (id) values (1) on conflict (id) do nothing;

alter table virtual_portfolio enable row level security;
drop policy if exists virtual_portfolio_select on virtual_portfolio;
create policy virtual_portfolio_select on virtual_portfolio for select using (true);

create table if not exists virtual_trades (
  id bigserial primary key,
  signal_id bigint not null unique references signals (id) on delete cascade,
  symbol text not null,
  direction text not null,                      -- فعلاً فقط buy (پرتفوی long-only)

  -- لحظهٔ صدور سیگنال
  signal_at timestamptz not null,
  signal_price numeric,                         -- last_price (pl) در لحظهٔ صدور
  signal_reasons jsonb,                         -- snapshot کامل reasons (قید #۶: بدون جعبه‌سیاه)
  signal_queue_state jsonb,                     -- {lockedBuy, lockedSell, heavy} در لحظهٔ صدور
  signal_market_open boolean,
  signal_tension_gauge numeric,                 -- global_quotes(asset='tension_index') در لحظهٔ صدور

  -- اجرای واقعی (ممکن است روزها بعد باشد یا اصلاً نباشد)
  status text not null,
  -- executed | partial | pending_queue | rejected_liquidity | rejected_max_positions
  -- | expired_queue | closed
  status_note text,
  entry_at timestamptz,
  entry_price numeric,
  share_count numeric,
  entry_fee numeric,
  queue_wait_days int not null default 0,       -- تعداد روزهای معاملاتی که در انتظار صف مانده

  -- خروج
  exit_at timestamptz,
  exit_price numeric,
  exit_fee numeric,
  exit_reason text,                             -- sell_signal | max_hold | stop_loss
  stop_loss_price numeric,                      -- ATR14×۱.۵ در لحظهٔ ورود (lib/position-sizing.ts)
  realized_pnl numeric,                         -- خالص بعد از هر دو کارمزد
  return_pct numeric,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists virtual_trades_status_idx on virtual_trades (status);
create index if not exists virtual_trades_symbol_idx on virtual_trades (symbol);
create index if not exists virtual_trades_signal_at_idx on virtual_trades (signal_at desc);

alter table virtual_trades enable row level security;
drop policy if exists virtual_trades_select on virtual_trades;
create policy virtual_trades_select on virtual_trades for select using (true);

insert into schema_log (filename, applied_by) values ('20260812120000_virtual_portfolio.sql', 'claude-code');
