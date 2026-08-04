-- Stage 03d — تنظیم وزن قوانین بر اساس نتیجهٔ بک‌تست ۵ ساله (2021-01-01..2026-08-03، ۶۵ معامله)
-- کاهش وزن قوانین پرتکرار با عملکرد منفی، افزایش وزن قوانین با عملکرد مثبت.
-- Rollback: به وزن‌های اولیهٔ stage03 برگردان (rsi_oversold=15, ema_cross_up=20,
--   suspicious_volume=10, buyer_power_strong=15, money_inflow_3d=20, near_52w_high=15,
--   composite_rank_strong=15).

-- ۵۴ بار trigger، win rate ۴۰.۷٪، جمع سود/زیان -۳۰۷هزار → وزن به‌شدت کم می‌شود، حذف نمی‌شود
update signal_rules set weight = 5 where name = 'composite_rank_strong';

-- ۶۲ بار trigger، win rate ۴۳.۵٪، جمع سود/زیان -۲۹۴هزار
update signal_rules set weight = 3 where name = 'suspicious_volume';

-- ۱۴ بار trigger، win rate ۲۸.۶٪، جمع سود/زیان -۱۴۸هزار
update signal_rules set weight = 8 where name = 'rsi_oversold';

-- ۲۹ بار trigger، win rate ۳۱٪، جمع سود/زیان -۱۳۶هزار
update signal_rules set weight = 8 where name = 'near_52w_high';

-- ۱۲ بار trigger، win rate ۶۶.۷٪، جمع سود/زیان +۳۸هزار
update signal_rules set weight = 25 where name = 'ema_cross_up';

-- ۶ بار trigger، win rate ۸۳.۳٪ (بالاترین)، جمع سود/زیان +۳۷هزار
update signal_rules set weight = 20 where name = 'buyer_power_strong';

-- ۲۵ بار trigger، win rate ۶۸٪، جمع سود/زیان +۳۸.۵هزار
update signal_rules set weight = 22 where name = 'money_inflow_3d';

insert into schema_log (filename, applied_by) values ('20260804095816_stage03d_tune_rule_weights.sql', 'claude-code');
