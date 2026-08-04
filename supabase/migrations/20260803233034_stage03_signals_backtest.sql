-- Stage 03 — composite technical rank, signal rule engine, backtest benchmarks
-- RLS enabled per CLAUDE.md (writes only via service_role, anon/authenticated read-only)
-- Rollback: drop table if exists signal_outcomes, signals, signal_rules, composite_rank, benchmark_candles cascade;

create table if not exists composite_rank (
  symbol text not null,
  date date not null,
  rank int not null,
  raw_score numeric,
  components jsonb,
  primary key (symbol, date)
);

create table if not exists signal_rules (
  id serial primary key,
  name text not null unique,
  definition jsonb not null,
  weight numeric not null,
  enabled bool not null default true
);

create table if not exists signals (
  id bigserial primary key,
  symbol text not null,
  direction text not null,
  score numeric not null,
  reasons jsonb not null,
  regime text not null default 'normal',
  created_at timestamptz not null default now()
);
create index if not exists signals_symbol_created_at_idx on signals (symbol, created_at desc);

create table if not exists signal_outcomes (
  signal_id bigint primary key references signals (id) on delete cascade,
  return_1d numeric,
  return_5d numeric,
  return_20d numeric,
  evaluated_at timestamptz
);

-- بنچمارک‌های بک‌تست: شاخص کل (tedpix)، دلار آزاد (usd_irr)، طلای ۱۸ عیار (gold_18k)
create table if not exists benchmark_candles (
  asset text not null,
  date date not null,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  primary key (asset, date)
);

alter table composite_rank enable row level security;
alter table signal_rules enable row level security;
alter table signals enable row level security;
alter table signal_outcomes enable row level security;
alter table benchmark_candles enable row level security;

drop policy if exists composite_rank_select on composite_rank;
create policy composite_rank_select on composite_rank for select using (true);

drop policy if exists signal_rules_select on signal_rules;
create policy signal_rules_select on signal_rules for select using (true);

drop policy if exists signals_select on signals;
create policy signals_select on signals for select using (true);

drop policy if exists signal_outcomes_select on signal_outcomes;
create policy signal_outcomes_select on signal_outcomes for select using (true);

drop policy if exists benchmark_candles_select on benchmark_candles;
create policy benchmark_candles_select on benchmark_candles for select using (true);

-- قوانین اولیه — وزن‌ها پیشنهاد اولیه‌اند، طبق پرامپت با نتیجهٔ بک‌تست تنظیم می‌شوند
insert into signal_rules (name, definition, weight, enabled) values
  ('rsi_oversold', '{"type":"threshold","metric":"rsi14","op":"<","value":30}', 15, true),
  ('rsi_overbought', '{"type":"threshold","metric":"rsi14","op":">","value":70}', -15, true),
  ('ema_cross_up', '{"type":"cross","fast":"EMA9","slow":"EMA26","direction":"up"}', 20, true),
  ('ema_cross_down', '{"type":"cross","fast":"EMA9","slow":"EMA26","direction":"down"}', -20, true),
  ('suspicious_volume', '{"type":"threshold","metric":"suspicious_volume","op":"==","value":1}', 10, true),
  ('buyer_power_strong', '{"type":"threshold","metric":"buyer_power","op":">","value":2}', 15, true),
  ('money_inflow_3d', '{"type":"streak","metric":"money_flow","op":">","value":0,"days":3}', 20, true),
  ('near_52w_high', '{"type":"threshold","metric":"pct_from_52w_high","op":">=","value":-3}', 15, true),
  ('near_52w_low', '{"type":"threshold","metric":"pct_from_52w_low","op":"<=","value":3}', -15, true),
  ('composite_rank_strong', '{"type":"threshold","metric":"composite_rank","op":">=","value":80}', 15, true)
on conflict (name) do nothing;

insert into schema_log (filename, applied_by) values ('20260803233034_stage03_signals_backtest.sql', 'claude-code');
