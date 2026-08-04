-- Stage 05c — زمان‌بندی pg_cron برای compute-tension، collect-news، evaluate-alerts
-- Rollback: select cron.unschedule('compute-tension'); select cron.unschedule('collect-news');
--           select cron.unschedule('evaluate-alerts'); select cron.unschedule('send-alert-digest');

select cron.schedule(
  'compute-tension',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://nritjejqugfvgihthctz.supabase.co/functions/v1/compute-tension',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yaXRqZWpxdWdmdmdpaHRoY3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTIzNzMsImV4cCI6MjEwMTMyODM3M30.ZKYS3YcMsLrlAZJnOAQZa-_vGJb6f7FVRiliRw-ntr4'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'collect-news',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://nritjejqugfvgihthctz.supabase.co/functions/v1/collect-news',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yaXRqZWpxdWdmdmdpaHRoY3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTIzNzMsImV4cCI6MjEwMTMyODM3M30.ZKYS3YcMsLrlAZJnOAQZa-_vGJb6f7FVRiliRw-ntr4'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- action: هر ۱۰ دقیقه چک می‌کند (سیگنال جدید، جهش tension، مرگ پایپ‌لاین) و فوری می‌فرستد
select cron.schedule(
  'evaluate-alerts',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://nritjejqugfvgihthctz.supabase.co/functions/v1/evaluate-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yaXRqZWpxdWdmdmdpaHRoY3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTIzNzMsImV4cCI6MjEwMTMyODM3M30.ZKYS3YcMsLrlAZJnOAQZa-_vGJb6f7FVRiliRw-ntr4'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- info: ساعتی، همهٔ هشدارهای info تحویل‌نشدهٔ ۱ ساعت اخیر را در یک پیام جمع می‌کند
select cron.schedule(
  'send-alert-digest',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://nritjejqugfvgihthctz.supabase.co/functions/v1/send-alert-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yaXRqZWpxdWdmdmdpaHRoY3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTIzNzMsImV4cCI6MjEwMTMyODM3M30.ZKYS3YcMsLrlAZJnOAQZa-_vGJb6f7FVRiliRw-ntr4'
    ),
    body := '{}'::jsonb
  );
  $$
);

insert into schema_log (filename, applied_by) values ('20260804170000_stage05c_cron_schedule.sql', 'claude-code');
