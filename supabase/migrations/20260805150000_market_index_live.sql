-- اصلاح: کالکتور زندهٔ شاخص کل/هم‌وزن/ارزش کل بازار (اصلاح مکمل روی incident collect-tse)
-- تحت تأثیر: market_index_quotes
-- Rollback: select cron.unschedule('collect-market-index'); drop table if exists market_index_quotes cascade;
--
-- تشخیص واقعی (نه فرض): benchmark_candles(asset='tedpix') هیچ به‌روزرسانی زنده‌ای نداشت — تنها
-- نویسنده‌اش scripts/backfill_benchmarks.py بود، یک اسکریپت پایتون یک‌بارمصرف محلی (نه cron).
-- کشف شد که BrsApi یک endpoint زنده برای شاخص دارد (Tsetmc/Index.php?type=1، بدون مستندات رسمی،
-- با تست زنده تأیید شد: index=5407901.78 دقیقاً با عدد نمایشی tsetmc.com یکی بود) که علاوه بر
-- شاخص کل/هم‌وزن، ارزش کل معاملات واقعی بازار (tval) و ارزش کل بازار (mv) هم می‌دهد —
-- tval واقعاً کل بورس است، نه فقط ۴۵ نماد واچ‌لیست.

create table if not exists market_index_quotes (
  id bigserial primary key,
  index_value numeric not null,
  index_change numeric,
  index_equal_weight numeric,
  index_equal_weight_change numeric,
  market_value numeric,
  total_trade_value numeric,
  total_trade_count int,
  total_trade_volume numeric,
  market_state text,
  captured_at timestamptz not null default now()
);
create index if not exists market_index_quotes_captured_at_idx on market_index_quotes (captured_at desc);

alter table market_index_quotes enable row level security;
drop policy if exists market_index_quotes_select on market_index_quotes;
create policy market_index_quotes_select on market_index_quotes for select using (true);

-- retention: مثل quotes (قید موجود پروژه)، ۹۰ روز کافی است
select cron.schedule(
  'market-index-quotes-retention',
  '10 2 * * *',
  $$ delete from market_index_quotes where captured_at < now() - interval '90 days'; $$
);

-- همان بازهٔ collect-tse (هر ۲ دقیقه، ساعات نظری بازار) — anon key، هرگز service_role در cron.
select cron.schedule(
  'collect-market-index',
  '*/2 5-9 * * 6,0,1,2,3',
  $$
  select net.http_post(
    url := 'https://nritjejqugfvgihthctz.supabase.co/functions/v1/collect-market-index',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yaXRqZWpxdWdmdmdpaHRoY3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTIzNzMsImV4cCI6MjEwMTMyODM3M30.ZKYS3YcMsLrlAZJnOAQZa-_vGJb6f7FVRiliRw-ntr4'
    ),
    body := '{}'::jsonb
  );
  $$
);

insert into schema_log (filename, applied_by) values ('20260805150000_market_index_live.sql', 'claude-code');
