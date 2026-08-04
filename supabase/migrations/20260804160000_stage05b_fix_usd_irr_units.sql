-- Stage 05b — رفع باگ واحد usd_irr در global_quotes: BrsApi Gold_Currency.php آرایهٔ
-- currency را به تومان می‌دهد (gold به ریال، سازگار) — collect-global بدون تبدیل ذخیره می‌کرد،
-- یعنی usd_irr در global_quotes ده برابر کوچک‌تر از benchmark_candles (ریال) بود. کد منبع
-- (lib/transforms/globalQuote.ts) در همین فاز ۵ اصلاح شد؛ این فایل فقط دادهٔ قبلاً نوشته‌شده
-- را یک‌بار اصلاح می‌کند. Idempotent با گارد schema_log چون UPDATE ×۱۰ خودش idempotent نیست.
-- تحت تأثیر: global_quotes (فقط ردیف‌های asset='usd_irr')
-- Rollback: update global_quotes set price = price / 10 where asset = 'usd_irr';

do $$
begin
  if not exists (
    select 1 from schema_log where filename = '20260804160000_stage05b_fix_usd_irr_units.sql'
  ) then
    update global_quotes set price = price * 10 where asset = 'usd_irr' and price is not null;
  end if;
end $$;

insert into schema_log (filename, applied_by) values ('20260804160000_stage05b_fix_usd_irr_units.sql', 'claude-code');
