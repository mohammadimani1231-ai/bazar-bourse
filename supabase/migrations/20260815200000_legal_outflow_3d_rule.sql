-- قانون «۳ روز متوالی خروج خالص پول حقوقی» — هم‌ساختار money_inflow_3d موجود، ولی روی
-- legal_net_flow (compute-tabloo، تازه اضافه شد). عمداً enabled=false: فقط از این پس
-- جمع‌آوری می‌شود، دادهٔ تاریخی برای backtest معنادار وجود ندارد (tabloo_metrics فقط ~۱۲ روز
-- پوشش دارد، رجوع به تحلیل ۲۰۲۶-۰۸-۱۵) — بعد از چند ماه جمع‌آوری، دوباره validate و بعد فعال شود.
-- تحت تأثیر: signal_rules
-- Rollback:
--   delete from signal_rules where name = 'legal_outflow_3d';

insert into signal_rules (name, definition, weight, enabled) values
  ('legal_outflow_3d', '{"type":"streak","metric":"legal_net_flow","op":">","value":0,"days":3}', -20, false)
on conflict (name) do nothing;

insert into schema_log (filename, applied_by) values ('20260815200000_legal_outflow_3d_rule.sql', 'claude-code');
