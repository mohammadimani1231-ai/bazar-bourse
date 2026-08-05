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
      <form action={login} className="w-full max-w-xs rounded-lg border border-border bg-surface p-6">
        <h1 className="mb-1 text-center text-lg font-bold">بازار بورس</h1>
        <p className="mb-4 text-center text-xs text-muted">این داشبورد شخصی است — برای ورود رمز را وارد کن.</p>
        <input type="hidden" name="next" value={next ?? "/"} />
        <input
          type="password"
          name="password"
          placeholder="رمز عبور"
          autoFocus
          required
          className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
        />
        {error && <p className="mt-2 text-xs text-down">رمز اشتباه است.</p>}
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
