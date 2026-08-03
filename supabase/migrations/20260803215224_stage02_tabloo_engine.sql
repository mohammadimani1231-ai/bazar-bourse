-- Stage 02 — tabloo-reading metrics engine
-- RLS enabled per CLAUDE.md (writes only via service_role, anon/authenticated read-only)
-- Rollback: drop table if exists tabloo_metrics cascade;

create table if not exists tabloo_metrics (
  id bigserial primary key,
  symbol text not null,
  metric text not null,
  value numeric,
  meta jsonb,
  captured_at timestamptz not null default now()
);
create index if not exists tabloo_metrics_symbol_metric_captured_at_idx
  on tabloo_metrics (symbol, metric, captured_at desc);

alter table tabloo_metrics enable row level security;

drop policy if exists tabloo_metrics_select on tabloo_metrics;
create policy tabloo_metrics_select on tabloo_metrics for select using (true);

insert into schema_log (filename, applied_by) values ('20260803215224_stage02_tabloo_engine.sql', 'claude-code');
