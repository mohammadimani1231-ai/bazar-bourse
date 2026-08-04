-- Stage 03c — market_holidays (قید CLAUDE.md #11: وضعیت بازار هرگز از روز هفته استنتاج نشود)
-- لایهٔ کمکی است، نه منبع حقیقت — کاربر تعطیلات رسمی/مذهبی هر سال را دستی وارد می‌کند.
-- RLS enabled per CLAUDE.md (writes only via service_role, anon/authenticated read-only)
-- Rollback: drop table if exists market_holidays cascade;

create table if not exists market_holidays (
  date date primary key,
  title text
);

alter table market_holidays enable row level security;

drop policy if exists market_holidays_select on market_holidays;
create policy market_holidays_select on market_holidays for select using (true);

insert into schema_log (filename, applied_by) values ('20260804085518_stage03c_market_status.sql', 'claude-code');
