-- Stage 06 — لایه AI: بریف روزانه
-- تحت تأثیر: ai_briefs
-- Rollback: drop table if exists ai_briefs cascade;

create table if not exists ai_briefs (
  id bigserial primary key,
  brief jsonb not null,
  input_snapshot jsonb not null,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ai_briefs_created_at_idx on ai_briefs (created_at desc);

alter table ai_briefs enable row level security;

drop policy if exists ai_briefs_select on ai_briefs;
create policy ai_briefs_select on ai_briefs for select using (true);

insert into schema_log (filename, applied_by) values ('20260804180000_stage06_ai_briefs.sql', 'claude-code');
