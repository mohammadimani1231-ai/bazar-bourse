"use client";

import { useState, useTransition } from "react";
import { addUser, removeUser } from "@/app/settings/access/actions.ts";
import { formatJalaliDateTime } from "@/lib/jalali.ts";

export interface SiteUserRow {
  id: number;
  username: string;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export function AccessManagement({ users, currentUsername }: { users: SiteUserRow[]; currentUsername: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAdminChecked, setIsAdminChecked] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  // دو useTransition جدا — تا کلیک «حذف» روی یک ردیف باعث نشود دکمهٔ «افزودن» فرم بالا هم
  // موقتاً غیرفعال/برچسب «در حال افزودن...» بگیرد (تست زنده این تداخل را نشان داد).
  const [isAdding, startAdd] = useTransition();
  const [isRemoving, startRemove] = useTransition();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    startAdd(async () => {
      try {
        const formData = new FormData();
        formData.set("username", username);
        formData.set("password", password);
        if (isAdminChecked) formData.set("is_admin", "on");
        await addUser(formData);
        setUsername("");
        setPassword("");
        setIsAdminChecked(false);
      } catch (err) {
        setAddError(err instanceof Error ? err.message : "افزودن کاربر ناموفق بود");
      }
    });
  };

  const handleRemove = (id: number) => {
    setRemoveError(null);
    startRemove(async () => {
      try {
        await removeUser(id);
      } catch (err) {
        setRemoveError(err instanceof Error ? err.message : "حذف کاربر ناموفق بود");
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleAdd} className="flex flex-col gap-3 rounded-lg border border-border bg-surface shadow-card p-4">
        <h2 className="text-sm font-bold text-foreground">افزودن کاربر جدید</h2>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="نام کاربری"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="off"
            className="w-40 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground transition-colors hover:border-accent/50 focus:border-accent focus:outline-none"
          />
          <input
            type="text"
            placeholder="رمز عبور (حداقل ۸ کاراکتر)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="off"
            className="w-52 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground ltr-nums transition-colors hover:border-accent/50 focus:border-accent focus:outline-none"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={isAdminChecked}
              onChange={(e) => setIsAdminChecked(e.target.checked)}
              className="accent-accent"
            />
            دسترسی ادمین (می‌تواند کاربر اضافه/حذف کند)
          </label>
        </div>
        {addError && <p className="text-xs text-down">{addError}</p>}
        <button
          type="submit"
          disabled={isAdding}
          className="w-fit rounded-md bg-accent px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isAdding ? "در حال افزودن..." : "افزودن دسترسی"}
        </button>
        <p className="text-xs text-muted">
          این رمز را مستقیم و امن (نه در پیام عمومی) به همان شخص بده — پس از ذخیره دیگر جایی در سایت نشان داده نمی‌شود.
        </p>
      </form>

      <div className="rounded-lg border border-border bg-surface shadow-card p-4">
        <h2 className="mb-3 text-sm font-bold text-foreground">کاربران دارای دسترسی ({users.length})</h2>
        {removeError && <p className="mb-2 text-xs text-down">{removeError}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="p-2 text-right">نام کاربری</th>
                <th className="p-2 text-right">نقش</th>
                <th className="p-2 text-right">آخرین ورود</th>
                <th className="p-2 text-right">تاریخ افزودن</th>
                <th className="p-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border/50 transition-colors hover:bg-surface-2">
                  <td className="p-2 font-bold text-foreground">
                    {u.username}
                    {u.username === currentUsername && <span className="mr-1.5 text-[10px] text-muted">(خودت)</span>}
                  </td>
                  <td className="p-2">
                    {u.isAdmin ? (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">ادمین</span>
                    ) : (
                      <span className="text-xs text-muted">عضو</span>
                    )}
                  </td>
                  <td className="ltr-nums p-2 text-xs text-muted">
                    {u.lastLoginAt ? formatJalaliDateTime(u.lastLoginAt) : "هنوز وارد نشده"}
                  </td>
                  <td className="ltr-nums p-2 text-xs text-muted">{formatJalaliDateTime(u.createdAt)}</td>
                  <td className="p-2 text-left">
                    <button
                      type="button"
                      disabled={isRemoving || u.username === currentUsername}
                      onClick={() => handleRemove(u.id)}
                      className="rounded-md border border-border px-2 py-1 text-xs text-down transition-colors hover:border-down hover:bg-down/10 disabled:opacity-40"
                    >
                      حذف دسترسی
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
