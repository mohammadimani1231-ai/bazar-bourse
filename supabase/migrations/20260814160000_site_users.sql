-- سیستم کاربر/رمز واقعی برای گیت ورود سایت — جایگزین رمز مشترک تک‌نفرهٔ قبلی (SITE_PASSWORD)
-- تا صاحب سایت بتواند به‌صورت جداگانه به هر نفر دسترسی بدهد/بگیرد، بدون یک رمز مشترک لو‌رفتنی.
-- تحت تأثیر: site_users
-- Rollback:
--   drop table if exists site_users cascade;

create table if not exists site_users (
  id bigserial primary key,
  username text not null unique,
  password_hash text not null,   -- PBKDF2-SHA256 هگز (lib/siteAuth.ts::hashPassword)
  password_salt text not null,   -- salt تصادفی جداگانه برای هر کاربر
  is_admin boolean not null default false,
  -- توکن سشن فعلی؛ لاگین جدید آن را عوض می‌کند (یعنی حداکثر یک سشن هم‌زمان)،
  -- null یعنی خارج شده/دسترسی گرفته‌شده. حذف کامل ردیف = لغو دسترسی برای همیشه.
  session_token text unique,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- ⚠️ برخلاف الگوی رایج بقیهٔ جدول‌های این پروژه («select using (true)» چون anon فقط SELECT
-- عمومی می‌خواهد، قید #۲ CLAUDE.md) — این جدول رمز/توکن نگه می‌دارد، پس عمداً هیچ policyـی
-- برایش تعریف نمی‌شود. با RLS فعال و بدون policy، anon/authenticated هیچ select/insert/update/
-- delete‌ای نمی‌توانند بزنند؛ فقط service_role (که RLS را دور می‌زند، همیشه از Server Action/
-- proxy.ts در بک‌اند) به آن دسترسی دارد. این را در بازبینی‌های بعدی «فراموش‌شده» فرض نکن.
alter table site_users enable row level security;

insert into schema_log (filename, applied_by) values ('20260814160000_site_users.sql', 'claude-code');
