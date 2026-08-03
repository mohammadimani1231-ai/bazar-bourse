-- Stage 01 — data pipeline: watchlist, quotes, daily_candles, global_quotes, pipeline_health
-- RLS enabled on every table per CLAUDE.md (writes only via service_role, anon/authenticated read-only)
-- Rollback: drop table if exists pipeline_health, global_quotes, daily_candles, quotes, watchlist cascade;

create table if not exists watchlist (
  id serial primary key,
  symbol text unique not null,
  ins_code text,
  industry text,
  market text default 'tse'
);

create table if not exists quotes (
  id bigserial primary key,
  symbol text not null,
  last_price numeric,
  close_price numeric,
  volume bigint,
  value numeric,
  trade_count int,
  buy_i_volume bigint,
  buy_n_volume bigint,
  sell_i_volume bigint,
  sell_n_volume bigint,
  buy_count_i int,
  sell_count_i int,
  bid1_price numeric,
  bid1_volume bigint,
  ask1_price numeric,
  ask1_volume bigint,
  price_max numeric,
  price_min numeric,
  base_volume bigint,
  captured_at timestamptz not null default now()
);
create index if not exists quotes_symbol_captured_at_idx on quotes (symbol, captured_at desc);

create table if not exists daily_candles (
  symbol text not null,
  date date not null,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  final_price numeric,
  volume bigint,
  value numeric,
  buy_i_volume bigint,
  sell_i_volume bigint,
  buy_count_i int,
  sell_count_i int,
  adjusted_close numeric,
  primary key (symbol, date)
);

create table if not exists global_quotes (
  id bigserial primary key,
  asset text not null,
  price numeric,
  change_pct numeric,
  captured_at timestamptz not null default now()
);
create index if not exists global_quotes_asset_captured_at_idx on global_quotes (asset, captured_at desc);

create table if not exists pipeline_health (
  id bigserial primary key,
  source text not null,
  status text not null,
  detail text,
  latency_ms int,
  checked_at timestamptz not null default now()
);
create index if not exists pipeline_health_source_checked_at_idx on pipeline_health (source, checked_at desc);

alter table watchlist enable row level security;
alter table quotes enable row level security;
alter table daily_candles enable row level security;
alter table global_quotes enable row level security;
alter table pipeline_health enable row level security;

drop policy if exists watchlist_select on watchlist;
create policy watchlist_select on watchlist for select using (true);

drop policy if exists quotes_select on quotes;
create policy quotes_select on quotes for select using (true);

drop policy if exists daily_candles_select on daily_candles;
create policy daily_candles_select on daily_candles for select using (true);

drop policy if exists global_quotes_select on global_quotes;
create policy global_quotes_select on global_quotes for select using (true);

drop policy if exists pipeline_health_select on pipeline_health;
create policy pipeline_health_select on pipeline_health for select using (true);

-- seed watchlist — verified live against BrsApi TSETMC_AllSymbols on 1405/05/12
insert into watchlist (symbol, ins_code, industry, market) values
  ('خودرو', '65883838195688438', 'خودرو و ساخت قطعات', 'tse'),
  ('خساپا', '44891482026867833', 'خودرو و ساخت قطعات', 'tse'),
  ('خبهمن', '26824673819862694', 'خودرو و ساخت قطعات', 'tse'),
  ('خگستر', '48990026850202503', 'خودرو و ساخت قطعات', 'tse'),
  ('خاور', '49270349234092953', 'خودرو و ساخت قطعات', 'tse'),
  ('ورنا', '7385624172574740', 'خودرو و ساخت قطعات', 'tse'),
  ('خپارس', '25211433301660888', 'خودرو و ساخت قطعات', 'tse'),
  ('خدیزل', '38084304113529336', 'خودرو و ساخت قطعات', 'tse'),
  ('وپاسار', '9536587154100457', 'بانک‌ها و موسسات اعتباری', 'tse'),
  ('وبملت', '778253364357513', 'بانک‌ها و موسسات اعتباری', 'tse'),
  ('وشهر', '41379697187196382', 'بانک‌ها و موسسات اعتباری', 'tse'),
  ('سامان', '22312990497291517', 'بانک‌ها و موسسات اعتباری', 'tse'),
  ('وتجارت', '63917421733088077', 'بانک‌ها و موسسات اعتباری', 'tse'),
  ('ونوین', '47302318535715632', 'بانک‌ها و موسسات اعتباری', 'tse'),
  ('وخاور', '47333458678352378', 'بانک‌ها و موسسات اعتباری', 'tse'),
  ('وپارس', '33293588228706998', 'بانک‌ها و موسسات اعتباری', 'tse'),
  ('فملی', '35425587644337450', 'فلزات اساسی', 'tse'),
  ('میدکو', '33441514568901717', 'فلزات اساسی', 'tse'),
  ('فایرا', '65004959184388996', 'فلزات اساسی', 'tse'),
  ('سیسکو', '5286237676293152', 'فلزات اساسی', 'tse'),
  ('هرمز', '70498485598181604', 'فلزات اساسی', 'tse'),
  ('ارفع', '59266699437480384', 'فلزات اساسی', 'tse'),
  ('کاوه', '60350996279289099', 'فلزات اساسی', 'tse'),
  ('آلومینا', '18661507395759423', 'فلزات اساسی', 'tse'),
  ('نوری', '19040514831923530', 'محصولات شیمیایی', 'tse'),
  ('پارسان', '23441366113375722', 'محصولات شیمیایی', 'tse'),
  ('تاپیکو', '22560050433388046', 'محصولات شیمیایی', 'tse'),
  ('شپدیس', '20562694899904339', 'محصولات شیمیایی', 'tse'),
  ('مارون', '53449700212786324', 'محصولات شیمیایی', 'tse'),
  ('پارس', '6110133418282108', 'محصولات شیمیایی', 'tse'),
  ('آریا', '55127657985997520', 'محصولات شیمیایی', 'tse'),
  ('شیراز', '38568786927478796', 'محصولات شیمیایی', 'tse'),
  ('شپنا', '7745894403636165', 'فراورده‌های نفتی، کک و سوخت هسته‌ای', 'tse'),
  ('شبندر', '35366681030756042', 'فراورده‌های نفتی، کک و سوخت هسته‌ای', 'tse'),
  ('شتران', '51617145873056483', 'فراورده‌های نفتی، کک و سوخت هسته‌ای', 'tse'),
  ('شبریز', '48753732042176709', 'فراورده‌های نفتی، کک و سوخت هسته‌ای', 'tse'),
  ('شسپا', '49188729526980541', 'فراورده‌های نفتی، کک و سوخت هسته‌ای', 'tse'),
  ('شراز', '14031158866706953', 'فراورده‌های نفتی، کک و سوخت هسته‌ای', 'tse'),
  ('کگل', '35700344742885862', 'استخراج کانه‌های فلزی', 'tse'),
  ('کچاد', '18027801615184692', 'استخراج کانه‌های فلزی', 'tse'),
  ('ومعادن', '58931793851445922', 'استخراج کانه‌های فلزی', 'tse'),
  ('کگهر', '30703140537034664', 'استخراج کانه‌های فلزی', 'tse'),
  ('تاصیکو', '23293437377896568', 'استخراج کانه‌های فلزی', 'tse'),
  ('فزر', '8175784894140974', 'استخراج کانه‌های فلزی', 'tse')
on conflict (symbol) do nothing;

create table if not exists schema_log (
  id serial primary key,
  filename text not null,
  applied_at timestamptz not null default now(),
  applied_by text
);
insert into schema_log (filename, applied_by) values ('20260803202132_stage01_data_pipeline.sql', 'claude-code');
