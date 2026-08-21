-- اصلاح ضریب تقسیم واحد: BrsApi currency (دلار/سکه/طلا) به هزارتومان می‌دهد، نه تومان
-- globalQuote.ts ضریب را از ×۱۰ به ×۱۰۰۰ اصلاح کرد (۲۰۲۶-۰۸-۲۰)
-- این migration رکوردهای تاریخی را (اگر موجود باشند) ×۱۰۰ اصلاح می‌کند (چون ۱۰۰ برابر کوچک‌تر ذخیره شده‌اند)

do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'global_quotes') then
    update global_quotes
    set price = price * 100
    where asset in ('usd_irr', 'gold_18k', 'coin_emami')
      and price is not null
      and price < 1000000  -- فقط اگر کوچکتر از ۱ میلیون باشند (یعنی اصلا ضریب به کار رفت)
      and not exists (
        select 1 from schema_log where filename = '20260820_fix_gold_currency_scale.sql'
      );
  end if;
end $$;

insert into schema_log (filename, applied_by) values ('20260820_fix_gold_currency_scale.sql', 'claude-code');
