"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Activity, Filter, Globe, FileText, HeartPulse, LineChart } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "نمای کلی", icon: LayoutDashboard },
  { href: "/signals", label: "سیگنال‌ها", icon: Activity },
  { href: "/screener", label: "اسکرینر", icon: Filter },
  { href: "/global", label: "نمای جهانی", icon: Globe },
  { href: "/reports", label: "گزارش‌ها", icon: FileText },
  { href: "/health", label: "سلامت", icon: HeartPulse },
];

/**
 * سایدبار راست (نه چپ) — چون صفحه RTL است و این محور آینه می‌شود، برخلاف چارت‌ها و اعداد
 * که هرگز آینه نمی‌شوند (بریف بازطراحی، prompts/redesign-visual-language.md).
 * icon-only زیر lg، آیکون+برچسب از lg به بالا — همیشه در دسترس، هیچ‌وقت کامل مخفی نمی‌شود.
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-dvh w-16 shrink-0 flex-col border-l border-border bg-surface lg:w-56">
      <Link
        href="/"
        className="flex h-14 shrink-0 items-center justify-center gap-2 border-b border-border px-2 text-sm font-bold text-foreground lg:justify-start lg:px-4"
      >
        <LineChart className="h-6 w-6 shrink-0 text-accent" aria-hidden="true" />
        <span className="hidden lg:inline">بازار بورس</span>
      </Link>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {LINKS.map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              title={link.label}
              className={`flex items-center justify-center gap-3 rounded-md px-2 py-2.5 text-sm transition-colors lg:justify-start lg:px-3 ${
                active ? "bg-accent text-white" : "text-muted hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="hidden lg:inline">{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
