-- Stage 07b — زمان‌بندی pg_cron برای weekly-report
-- ۰۶:۳۰ UTC پنجشنبه = ۱۰:۰۰ تهران (Tehran = UTC+3:30)
-- Rollback: select cron.unschedule('weekly-report');

select cron.schedule(
  'weekly-report',
  '30 6 * * 4',
  $$
  select net.http_post(
    url := 'https://nritjejqugfvgihthctz.supabase.co/functions/v1/weekly-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yaXRqZWpxdWdmdmdpaHRoY3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTIzNzMsImV4cCI6MjEwMTMyODM3M30.ZKYS3YcMsLrlAZJnOAQZa-_vGJb6f7FVRiliRw-ntr4'
    ),
    body := '{}'::jsonb
  );
  $$
);

insert into schema_log (filename, applied_by) values ('20260805110000_stage07b_weekly_report_cron.sql', 'claude-code');
