-- Stage 01c — ستون نام کامل شرکت روی watchlist، برای نمایش کنار نماد در اسکرینر
-- (کاربر نمی‌دانست "فولاد" مخفف چیست؛ نماد به‌تنهایی برای کاربر غیرمتخصص خوانا نیست)
-- Rollback: alter table watchlist drop column if exists company_name;

alter table watchlist add column if not exists company_name text;

insert into schema_log (filename, applied_by) values ('20260805130000_stage01c_watchlist_company_name.sql', 'claude-code');
