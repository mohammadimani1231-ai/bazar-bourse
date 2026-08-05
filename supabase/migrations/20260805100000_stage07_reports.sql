-- Stage 07 — ماژول گزارش‌گیری تحلیلی: گزارش هفتگی + گزارش تک‌نماد
-- تحت تأثیر: reports
-- Rollback: drop table if exists reports cascade;

create table if not exists reports (
  id bigserial primary key,
  type text not null,              -- weekly | symbol
  period text not null,            -- هفتگی: بازهٔ تاریخ (2026-07-28..2026-08-03)؛ تک‌نماد: نماد+تاریخ تولید
  html text not null,
  data_snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists reports_type_created_at_idx on reports (type, created_at desc);

alter table reports enable row level security;

drop policy if exists reports_select on reports;
create policy reports_select on reports for select using (true);

insert into schema_log (filename, applied_by) values ('20260805100000_stage07_reports.sql', 'claude-code');
