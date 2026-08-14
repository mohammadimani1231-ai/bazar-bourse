import { login } from "./actions.ts";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form action={login} className="w-full max-w-xs rounded-lg border border-border bg-surface shadow-card p-6">
        <h1 className="mb-1 text-center text-lg font-bold">بازار بورس</h1>
        <p className="mb-4 text-center text-xs text-muted">این داشبورد شخصی است — برای ورود نام کاربری و رمز را وارد کن.</p>
        <input type="hidden" name="next" value={next ?? "/"} />
        <input
          type="text"
          name="username"
          placeholder="نام کاربری"
          autoFocus
          required
          autoComplete="username"
          className="mb-2 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground transition-colors hover:border-accent/50 focus:border-accent focus:outline-none"
        />
        <input
          type="password"
          name="password"
          placeholder="رمز عبور"
          required
          autoComplete="current-password"
          className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground transition-colors hover:border-accent/50 focus:border-accent focus:outline-none"
        />
        {error && <p className="mt-2 text-xs text-down">نام کاربری یا رمز اشتباه است.</p>}
        <button
          type="submit"
          className="mt-3 w-full rounded-md bg-accent px-3 py-2 text-sm font-bold text-white hover:opacity-90"
        >
          ورود
        </button>
      </form>
    </div>
  );
}
