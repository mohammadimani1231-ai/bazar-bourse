-- Stage 01b — pg_cron/pg_net scheduling for the four collector Edge Functions + retention
-- anon key is hardcoded intentionally: it's the public, RLS-guarded key (never service_role).
-- Rollback:
--   select cron.unschedule('collect-tse'); select cron.unschedule('collect-global');
--   select cron.unschedule('build-candles'); select cron.unschedule('health-check');
--   select cron.unschedule('quotes-retention');

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'collect-tse',
  '*/2 5-9 * * 6,0,1,2,3',
  $$
  select net.http_post(
    url := 'https://nritjejqugfvgihthctz.supabase.co/functions/v1/collect-tse',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yaXRqZWpxdWdmdmdpaHRoY3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTIzNzMsImV4cCI6MjEwMTMyODM3M30.ZKYS3YcMsLrlAZJnOAQZa-_vGJb6f7FVRiliRw-ntr4'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'collect-global',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://nritjejqugfvgihthctz.supabase.co/functions/v1/collect-global',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yaXRqZWpxdWdmdmdpaHRoY3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTIzNzMsImV4cCI6MjEwMTMyODM3M30.ZKYS3YcMsLrlAZJnOAQZa-_vGJb6f7FVRiliRw-ntr4'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'build-candles',
  '30 10 * * 6,0,1,2,3',
  $$
  select net.http_post(
    url := 'https://nritjejqugfvgihthctz.supabase.co/functions/v1/build-candles',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yaXRqZWpxdWdmdmdpaHRoY3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTIzNzMsImV4cCI6MjEwMTMyODM3M30.ZKYS3YcMsLrlAZJnOAQZa-_vGJb6f7FVRiliRw-ntr4'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'health-check',
  '*/10 5-9 * * 6,0,1,2,3',
  $$
  select net.http_post(
    url := 'https://nritjejqugfvgihthctz.supabase.co/functions/v1/health-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yaXRqZWpxdWdmdmdpaHRoY3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTIzNzMsImV4cCI6MjEwMTMyODM3M30.ZKYS3YcMsLrlAZJnOAQZa-_vGJb6f7FVRiliRw-ntr4'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- retention: quotes cap ~500MB روی پلن رایگان، ۹۰ روز نگه‌داری کافیست
select cron.schedule(
  'quotes-retention',
  '0 2 * * *',
  $$ delete from quotes where captured_at < now() - interval '90 days'; $$
);

insert into schema_log (filename, applied_by) values ('20260803210203_stage01b_pg_cron_schedule.sql', 'claude-code');
