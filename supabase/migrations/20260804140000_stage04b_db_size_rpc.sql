-- Stage 04b — تابع RPC برای اندازهٔ دیتابیس (صفحهٔ /health، سقف ۵۰۰MB پلن رایگان)
-- تحت تأثیر: تابع db_size_bytes
-- Rollback: drop function if exists public.db_size_bytes();

create or replace function public.db_size_bytes()
returns bigint
language sql
security definer
set search_path = public
as $$
  select pg_database_size(current_database());
$$;

grant execute on function public.db_size_bytes() to anon, authenticated;

insert into schema_log (filename, applied_by) values ('20260804140000_stage04b_db_size_rpc.sql', 'claude-code');
