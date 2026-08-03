-- Stage 02b — pg_cron schedule for compute-tabloo
-- anon key hardcoded intentionally (public, RLS-guarded key — see stage01b for rationale)
-- Rollback: select cron.unschedule('compute-tabloo');

select cron.schedule(
  'compute-tabloo',
  '*/10 5-9 * * 6,0,1,2,3',
  $$
  select net.http_post(
    url := 'https://nritjejqugfvgihthctz.supabase.co/functions/v1/compute-tabloo',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yaXRqZWpxdWdmdmdpaHRoY3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTIzNzMsImV4cCI6MjEwMTMyODM3M30.ZKYS3YcMsLrlAZJnOAQZa-_vGJb6f7FVRiliRw-ntr4'
    ),
    body := '{}'::jsonb
  );
  $$
);

insert into schema_log (filename, applied_by) values ('20260803215608_stage02b_compute_tabloo_schedule.sql', 'claude-code');
