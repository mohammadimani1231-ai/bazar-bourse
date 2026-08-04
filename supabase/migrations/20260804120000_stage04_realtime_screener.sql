-- Stage 04 — فعال‌سازی Supabase Realtime روی quotes/signals + جدول screener_presets
-- تحت تأثیر: publication supabase_realtime، جدول جدید screener_presets
-- Rollback: alter publication supabase_realtime drop table quotes, signals;
--           drop table if exists screener_presets cascade;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quotes'
  ) then
    alter publication supabase_realtime add table quotes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'signals'
  ) then
    alter publication supabase_realtime add table signals;
  end if;
end $$;

create table if not exists screener_presets (
  id bigserial primary key,
  name text not null,
  filters jsonb not null,
  created_at timestamptz not null default now()
);

alter table screener_presets enable row level security;

drop policy if exists screener_presets_select on screener_presets;
create policy screener_presets_select on screener_presets for select using (true);

insert into schema_log (filename, applied_by) values ('20260804120000_stage04_realtime_screener.sql', 'claude-code');
