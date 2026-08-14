"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/adminClient.ts";
import { getCurrentUser } from "@/lib/authSession.ts";
import { generateSalt, hashPassword } from "@/lib/auth.ts";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) throw new Error("فقط ادمین به مدیریت کاربران دسترسی دارد");
  return user;
}

export async function addUser(formData: FormData): Promise<void> {
  await requireAdmin();

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const isAdmin = formData.get("is_admin") === "on";

  if (!username || !password) throw new Error("نام کاربری و رمز الزامی است");
  if (password.length < 8) throw new Error("رمز باید حداقل ۸ کاراکتر باشد");

  const supabase = createAdminSupabaseClient();
  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);

  const { error } = await supabase.from("site_users").insert({
    username,
    password_hash: passwordHash,
    password_salt: salt,
    is_admin: isAdmin,
  });
  if (error) {
    throw new Error(error.code === "23505" ? "این نام کاربری قبلاً ثبت شده" : error.message);
  }

  revalidatePath("/settings/access");
}

export async function removeUser(id: number): Promise<void> {
  const currentUser = await requireAdmin();

  const supabase = createAdminSupabaseClient();
  const { data: target } = await supabase.from("site_users").select("username, is_admin").eq("id", id).maybeSingle();
  if (!target) return;

  if (target.username === currentUser.username) {
    throw new Error("نمی‌توانی حساب خودت را حذف کنی — با یک حساب ادمین دیگر وارد شو و از آنجا حذفش کن");
  }

  if (target.is_admin) {
    const { count } = await supabase
      .from("site_users")
      .select("id", { count: "exact", head: true })
      .eq("is_admin", true);
    if ((count ?? 0) <= 1) {
      throw new Error("آخرین حساب ادمین را نمی‌شود حذف کرد — سایت بدون ادمین می‌ماند");
    }
  }

  const { error } = await supabase.from("site_users").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/access");
}
