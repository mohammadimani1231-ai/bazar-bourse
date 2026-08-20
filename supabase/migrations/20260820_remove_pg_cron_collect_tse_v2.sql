-- بازگشت pg_cron collect-tse؛ این بار شامل هر دو pg_cron و migration log check
-- (migration قبلی با نام ثابت 'collect-tse' شکست خورد چون موجود نبود)

do $$
declare
  rec record;
begin
  if not exists (
    select 1 from schema_log where filename = '20260820_remove_pg_cron_collect_tse_v2.sql'
  ) then
    for rec in
      select jobid
      from cron.job
      where command ilike '%/collect-tse%'
    loop
      perform cron.unschedule(rec.jobid);
    end loop;
  end if;
end $$;

insert into schema_log (filename, applied_by) values ('20260820_remove_pg_cron_collect_tse_v2.sql', 'claude-code');
