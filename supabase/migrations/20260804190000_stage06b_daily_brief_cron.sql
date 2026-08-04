-- Stage 06b — زمان‌بندی pg_cron برای daily-brief
-- ۰۵:۰۰ UTC = ۸:۳۰ تهران، قبل از بازگشایی بازار (شنبه تا چهارشنبه)
-- Rollback: select cron.unschedule('daily-brief');

select cron.schedule(
  'daily-brief',
  '0 5 * * 6,0,1,2,3',
  $$
  select net.http_post(
    url := 'https://nritjejqugfvgihthctz.supabase.co/functions/v1/daily-brief',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yaXRqZWpxdWdmdmdpaHRoY3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTIzNzMsImV4cCI6MjEwMTMyODM3M30.ZKYS3YcMsLrlAZJnOAQZa-_vGJb6f7FVRiliRw-ntr4'
    ),
    body := '{}'::jsonb
  );
  $$
);

insert into schema_log (filename, applied_by) values ('20260804190000_stage06b_daily_brief_cron.sql', 'claude-code');
