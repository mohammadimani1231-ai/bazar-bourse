-- زیرساخت بات چندکاربرهٔ تلگرام: جدول مشترکین + RLS. طبق قید #۲ (نوشتن فقط service_role)،
-- این جدول حتی select عمومی هم ندارد (chat_id/username اطلاعات کاربرهاست، در هیچ صفحهٔ
-- داشبورد لازم نیست نمایش داده شود) — فقط Edge Function ها (service_role) بهش دسترسی دارند.
create table if not exists telegram_subscribers (
  chat_id bigint primary key,
  username text,
  first_name text,
  joined_at timestamptz not null default now(),
  active boolean not null default true
);

alter table telegram_subscribers enable row level security;

insert into schema_log (filename, applied_by) values ('20260811120000_telegram_subscribers.sql', 'claude-code');
