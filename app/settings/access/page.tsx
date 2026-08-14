import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/authSession.ts";
import { createAdminSupabaseClient } from "@/lib/supabase/adminClient.ts";
import { AccessManagement, type SiteUserRow } from "@/components/AccessManagement";

// فقط ادمین — لیست کاربران/رمزها فقط با service_role خوانده می‌شود (site_users جدول
// حساسی است، بدون RLS policy عمومی، رجوع به migration 20260814160000).
export const dynamic = "force-dynamic";

export default async function AccessPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser?.isAdmin) {
    redirect("/");
  }

  const supabase = createAdminSupabaseClient();
  const { data } = await supabase
    .from("site_users")
    .select("id, username, is_admin, created_at, last_login_at")
    .order("created_at", { ascending: true });

  const users: SiteUserRow[] = (data ?? []).map((u) => ({
    id: u.id,
    username: u.username,
    isAdmin: u.is_admin,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
  }));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted">
        هرکسی که اینجا اضافه کنی می‌تواند با نام کاربری/رمز خودش وارد کل سایت شود — کسی بدون این نمی‌تواند وارد شود.
      </p>
      <AccessManagement users={users} currentUsername={currentUser.username} />
    </div>
  );
}
