-- pg_cron schedule برای execute-virtual-trades (قید #۱: Vercel Cron ممنوع)
-- anon key عمداً هاردکد است (کلید عمومی و RLS-guarded — دلیلش در stage01b مستند شده)
-- زمان‌بندی: هر ۱۰ دقیقه در ساعات بازار، ۵ دقیقه بعد از compute-signals (که روی '*/10 5-9')
-- اجرا می‌شود — تا سیگنال‌های همان چرخه قبلاً در جدول signals نشسته باشند.
-- Rollback: select cron.unschedule('execute-virtual-trades');

select cron.schedule(
  'execute-virtual-trades',
  '5-59/10 5-9 * * 6,0,1,2,3',
  $$
  select net.http_post(
    url := 'https://nritjejqugfvgihthctz.supabase.co/functions/v1/execute-virtual-trades',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yaXRqZWpxdWdmdmdpaHRoY3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTIzNzMsImV4cCI6MjEwMTMyODM3M30.ZKYS3YcMsLrlAZJnOAQZa-_vGJb6f7FVRiliRw-ntr4'
    ),
    body := '{}'::jsonb
  );
  $$
);

insert into schema_log (filename, applied_by) values ('20260812120500_virtual_portfolio_cron.sql', 'claude-code');
