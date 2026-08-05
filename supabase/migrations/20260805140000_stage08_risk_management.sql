-- Stage 08 — مدیریت ریسک و اندازه پوزیشن + دفتر معاملات کاغذی
-- تحت تأثیر: risk_settings, paper_trades
-- Rollback: drop table if exists paper_trades cascade; drop table if exists risk_settings cascade;

create table if not exists risk_settings (
  id int primary key default 1,
  total_capital numeric,
  max_risk_per_trade_pct numeric not null default 1.5,
  max_concurrent_positions int not null default 8,
  max_sector_exposure_pct numeric not null default 30,
  max_single_position_pct numeric not null default 15,
  -- کلیدها باید دقیقاً با lib/marketRegime.ts::MARKET_REGIMES یکی باشند
  regime_risk_multiplier jsonb not null default '{"normal":1,"war_risk":0.5,"agreement_hope":0.75}',
  updated_at timestamptz not null default now(),
  check (id = 1)
);
insert into risk_settings (id) values (1) on conflict (id) do nothing;

alter table risk_settings enable row level security;
drop policy if exists risk_settings_select on risk_settings;
create policy risk_settings_select on risk_settings for select using (true);

create table if not exists paper_trades (
  id bigserial primary key,
  symbol text not null,
  signal_id bigint references signals (id),
  entry_price numeric not null,
  stop_loss numeric,
  share_count numeric not null,
  entry_date date not null default current_date,
  exit_price numeric,
  exit_date date,
  status text not null default 'open',   -- open | closed
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists paper_trades_status_idx on paper_trades (status);
create index if not exists paper_trades_symbol_idx on paper_trades (symbol);

alter table paper_trades enable row level security;
drop policy if exists paper_trades_select on paper_trades;
create policy paper_trades_select on paper_trades for select using (true);

insert into schema_log (filename, applied_by) values ('20260805140000_stage08_risk_management.sql', 'claude-code');
