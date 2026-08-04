-- Stage 05 — لایه ژئوپلیتیک: تنظیمات، اخبار، هشدار تلگرام
-- تحت تأثیر: settings, news_items, alert_rules, alert_log
-- Rollback: drop table if exists alert_log, alert_rules, news_items, settings cascade;

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists news_items (
  id bigserial primary key,
  title text not null,
  source text not null,
  url text not null,
  matched_keywords text[] not null default '{}',
  published_at timestamptz,
  captured_at timestamptz not null default now()
);
create unique index if not exists news_items_url_key on news_items (url);
create index if not exists news_items_published_at_idx on news_items (published_at desc);

create table if not exists alert_rules (
  id serial primary key,
  name text not null unique,
  condition jsonb not null,
  severity text not null,                                  -- action | info
  fire_policy text not null default 'once_per_bar_close',   -- once | once_per_bar_close | cooldown
  cooldown_minutes int,
  enabled bool not null default true
);

create table if not exists alert_log (
  id bigserial primary key,
  rule_id int references alert_rules (id) on delete cascade,
  fired_at timestamptz not null default now(),
  payload jsonb not null,
  delivered bool not null default false
);
create index if not exists alert_log_rule_fired_idx on alert_log (rule_id, fired_at desc);
create index if not exists alert_log_undelivered_idx on alert_log (delivered, fired_at) where not delivered;

alter table settings enable row level security;
alter table news_items enable row level security;
alter table alert_rules enable row level security;
alter table alert_log enable row level security;

drop policy if exists settings_select on settings;
create policy settings_select on settings for select using (true);

drop policy if exists news_items_select on news_items;
create policy news_items_select on news_items for select using (true);

drop policy if exists alert_rules_select on alert_rules;
create policy alert_rules_select on alert_rules for select using (true);

drop policy if exists alert_log_select on alert_log;
create policy alert_log_select on alert_log for select using (true);

-- تنظیمات پیش‌فرض — feeds/keywords عمداً configurable هستند نه هاردکد در Edge Function
insert into settings (key, value) values
  ('market_regime', '"normal"'::jsonb),
  ('news_feeds', '[
    {"url":"https://donya-e-eqtesad.com/rss","source":"دنیای اقتصاد"},
    {"url":"https://www.eghtesadonline.com/rss","source":"اقتصاد آنلاین"},
    {"url":"https://www.isna.ir/rss","source":"ایسنا"},
    {"url":"https://www.mehrnews.com/rss","source":"مهر"},
    {"url":"https://www.tehrantimes.com/rss","source":"Tehran Times"},
    {"url":"https://www.aljazeera.com/xml/rss/all.xml","source":"Al Jazeera"}
  ]'::jsonb),
  ('news_keywords', '[
    "مذاکره","توافق","تحریم","حمله","برجام","جنگ","آتش‌بس","تنش","موشک","تحریم‌ها",
    "sanction","sanctions","iran","nuclear","ceasefire","strike","missile","israel"
  ]'::jsonb)
on conflict (key) do nothing;

-- قوانین هشدار پیش‌فرض
insert into alert_rules (name, condition, severity, fire_policy, cooldown_minutes, enabled) values
  ('new_buy_signal', '{"type":"signal","direction":"buy"}'::jsonb, 'action', 'once', null, true),
  ('new_sell_signal', '{"type":"signal","direction":"sell"}'::jsonb, 'action', 'once', null, true),
  ('tension_spike', '{"type":"tension_index","op":">=","value":70}'::jsonb, 'action', 'cooldown', 240, true),
  ('pipeline_down', '{"type":"pipeline_health","status":"error"}'::jsonb, 'action', 'cooldown', 60, true),
  ('suspicious_volume_digest', '{"type":"tabloo_metric","metric":"suspicious_volume"}'::jsonb, 'info', 'once_per_bar_close', null, true),
  ('whale_digest', '{"type":"tabloo_metric","metric":"whale"}'::jsonb, 'info', 'once_per_bar_close', null, true),
  ('code_to_code_digest', '{"type":"tabloo_metric","metric":"code_to_code"}'::jsonb, 'info', 'once_per_bar_close', null, true)
on conflict (name) do nothing;

insert into schema_log (filename, applied_by) values ('20260804150000_stage05_geopolitics_alerts.sql', 'claude-code');
