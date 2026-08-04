-- Stage 03b — pg_cron schedule for compute-rank, compute-signals, evaluate-signal-outcomes
-- anon key hardcoded intentionally (public, RLS-guarded key — see stage01b for rationale)
-- Rollback:
--   select cron.unschedule('compute-rank'); select cron.unschedule('compute-signals');
--   select cron.unschedule('evaluate-signal-outcomes');

select cron.schedule(
  'compute-rank',
  '40 10 * * 6,0,1,2,3',
  $$
  select net.http_post(
    url := 'https://nritjejqugfvgihthctz.supabase.co/functions/v1/compute-rank',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yaXRqZWpxdWdmdmdpaHRoY3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTIzNzMsImV4cCI6MjEwMTMyODM3M30.ZKYS3YcMsLrlAZJnOAQZa-_vGJb6f7FVRiliRw-ntr4'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'compute-signals',
  '*/10 5-9 * * 6,0,1,2,3',
  $$
  select net.http_post(
    url := 'https://nritjejqugfvgihthctz.supabase.co/functions/v1/compute-signals',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yaXRqZWpxdWdmdmdpaHRoY3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTIzNzMsImV4cCI6MjEwMTMyODM3M30.ZKYS3YcMsLrlAZJnOAQZa-_vGJb6f7FVRiliRw-ntr4'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'evaluate-signal-outcomes',
  '45 10 * * 6,0,1,2,3',
  $$
  select net.http_post(
    url := 'https://nritjejqugfvgihthctz.supabase.co/functions/v1/evaluate-signal-outcomes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yaXRqZWpxdWdmdmdpaHRoY3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTIzNzMsImV4cCI6MjEwMTMyODM3M30.ZKYS3YcMsLrlAZJnOAQZa-_vGJb6f7FVRiliRw-ntr4'
    ),
    body := '{}'::jsonb
  );
  $$
);

insert into schema_log (filename, applied_by) values ('20260804082930_stage03b_signals_schedule.sql', 'claude-code');
