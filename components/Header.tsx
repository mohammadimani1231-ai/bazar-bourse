"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Moon, Sun, LogOut } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { SymbolPicker, type SymbolOption } from "@/components/SymbolPicker";
import { logout } from "@/app/login/actions.ts";
import type { MarketRegime } from "@/lib/marketRegime.ts";

const PAGE_TITLES: { pattern: RegExp; label: string }[] = [
  { pattern: /^\/signals/, label: "سیگنال‌ها" },
  { pattern: /^\/screener/, label: "اسکرینر" },
  { pattern: /^\/portfolio/, label: "پرتفوی" },
  { pattern: /^\/track-record/, label: "کارنامهٔ عملکرد" },
  { pattern: /^\/global/, label: "نمای جهانی" },
  { pattern: /^\/reports/, label: "گزارش‌ها" },
  { pattern: /^\/settings\/risk/, label: "تنظیمات ریسک" },
  { pattern: /^\/health/, label: "سلامت" },
  { pattern: /^\/symbol\//, label: "نماد" },
  { pattern: /^\/briefs/, label: "تحلیل‌های قبلی" },
  { pattern: /^\/$/, label: "نمای کلی" },
];

const REGIME_META: Record<Exclude<MarketRegime, "normal">, { label: string; className: string }> = {
  war_risk: { label: "رژیم بازار: تنش", className: "border-down bg-down/12 text-down" },
  agreement_hope: { label: "رژیم بازار: امید توافق", className: "border-up bg-up/12 text-up" },
};

/**
 * هدر سراسری چسبان — طبق design_handoff_dashboard_redesign: عنوان صفحه + بج رژیم بازار در یک
 * ردیف (جایگزین RegimeBanner قبلی که یک نوار جدای تمام‌عرض بود)، جست‌وجوی نماد، و سوییچ تم.
 */
export function Header({
  regime,
  symbolOptions,
  username,
}: {
  regime: MarketRegime;
  symbolOptions: SymbolOption[];
  username: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [symbol, setSymbol] = useState("");
  const [isLoggingOut, startLogout] = useTransition();

  const handleLogout = () => {
    startLogout(async () => {
      await logout();
      // navigation کامل (نه فقط router.push) عمداً — Router Cache صفحات دیگر گاهی نام کاربری
      // قبلی را در Header نگه می‌داشت (تست زندهٔ agent-browser این را نشان داد).
      window.location.href = "/login";
    });
  };

  const title = PAGE_TITLES.find((p) => p.pattern.test(pathname))?.label ?? "بازار بورس";

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="whitespace-nowrap text-lg font-bold text-foreground">{title}</h1>
        {regime !== "normal" && (
          <span className={`hidden whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold sm:inline-block ${REGIME_META[regime].className}`}>
            {REGIME_META[regime].label}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <SymbolPicker
          className="w-32 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-accent sm:w-56"
          options={symbolOptions}
          value={symbol}
          onChange={(s) => {
            setSymbol(s);
            if (s) router.push(`/symbol/${encodeURIComponent(s)}`);
          }}
        />
        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-accent focus-visible:border-accent"
        >
          {theme === "dark" ? <Sun className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Moon className="h-4 w-4 shrink-0" aria-hidden="true" />}
          <span className="hidden md:inline">{theme === "dark" ? "حالت روشن" : "حالت تاریک"}</span>
        </button>
        {username && (
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            title={`خروج از حساب ${username}`}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-down hover:text-down focus-visible:border-down disabled:opacity-50"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="hidden lg:inline">{username}</span>
          </button>
        )}
      </div>
    </header>
  );
}
