-- رفع incident زنده: collect-tse/collect-market-index هنوز از pg_cron قدیمی (که مستقیم Edge
-- Function روی Supabase را صدا می‌زند، از IP همان Supabase که BrsApi مسدودش کرده) اجرا می‌شدند،
-- با اینکه scripts/vps-relay از همان روز (۲۰۲۶-۰۸-۰۹) قرار بود جایگزینش کند — قدم unschedule که
-- در scripts/vps-relay/README.md به‌عنوان «کار باقی‌مانده» ثبت شده بود، هرگز اجرا نشده بود.
-- کوئری مستقیم pipeline_health تأیید کرد: در تمام ساعات بازار امروز، هر دو source با خطای
-- «The signal has been aborted» ۱۰۰٪ شکست خوردند، بدون هیچ ردیف موفق.
-- این migration فقط دو cron job قدیمی را حذف می‌کند؛ خود Edge Function ها (collect-tse،
-- collect-market-index) دست‌نخورده می‌مانند (بی‌ضرر، صرفاً دیگر زمان‌بندی نمی‌شوند).
-- Rollback: دوباره از supabase/migrations/20260803210203_stage01b_pg_cron_schedule.sql و
-- 20260805150000_market_index_live.sql تعریف cron.schedule مربوطه را کپی و اجرا کن.

-- توجه: تلاش اول این migration با نام ثابت ('collect-tse') با خطای «could not find valid
-- entry for job 'collect-tse'» شکست خورد — یعنی نام واقعی ثبت‌شده در cron.job با نامی که در
-- migration اصلی (20260803210203_stage01b_pg_cron_schedule.sql) پاس داده شده بود یکی نیست
-- (یا اصلاً آن cron.schedule هیچ‌وقت با موفقیت اجرا نشده). به‌جای فرض نام، اینجا بر اساس محتوای
-- واقعی ستون command (شامل مسیر URL تابع) پیدا و با jobid (نه jobname) unschedule می‌شود —
-- امن در برابر هر نام واقعی، و اگر هیچ ردیفی پیدا نشود حلقه بی‌اثر است، نه خطا.
do $$
declare
  rec record;
begin
  if not exists (
    select 1 from schema_log where filename = '20260809230000_unschedule_collect_tse_market_index_pg_cron.sql'
  ) then
    for rec in
      select jobid, jobname, command
      from cron.job
      where command ilike '%/collect-tse%' or command ilike '%/collect-market-index%'
    loop
      raise notice 'unscheduling cron job % (jobid=%): %', rec.jobname, rec.jobid, rec.command;
      perform cron.unschedule(rec.jobid);
    end loop;
  end if;
end $$;

insert into schema_log (filename, applied_by) values ('20260809230000_unschedule_collect_tse_market_index_pg_cron.sql', 'claude-code');
