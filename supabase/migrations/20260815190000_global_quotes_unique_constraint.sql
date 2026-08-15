-- دفاع در عمق برای retry امن روی JWT skew (PGRST303) در collect-global — بدون این، هر retry
-- (چه همین یکی چه هر retry دیگری که در آینده اضافه شود) می‌توانست ردیف تکراری بسازد چون
-- global_quotes قبلاً هیچ کلید طبیعی/unique constraint‌ای نداشت، فقط id سریال.
-- تحت تأثیر: global_quotes
-- پیش‌نیاز idempotency: قبل از اجرا تأیید شد صفر ردیف تکراری (asset, captured_at) در جدول هست.
-- Rollback:
--   alter table global_quotes drop constraint if exists global_quotes_asset_captured_at_key;

alter table global_quotes
  add constraint global_quotes_asset_captured_at_key unique (asset, captured_at);

insert into schema_log (filename, applied_by) values ('20260815190000_global_quotes_unique_constraint.sql', 'claude-code');
