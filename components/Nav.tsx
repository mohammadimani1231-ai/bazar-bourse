"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "نمای کلی" },
  { href: "/signals", label: "سیگنال‌ها" },
  { href: "/screener", label: "اسکرینر" },
  { href: "/global", label: "نمای جهانی" },
  { href: "/health", label: "سلامت" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 overflow-x-auto px-4 py-3">
        <Link href="/" className="shrink-0 text-sm font-bold text-foreground">
          بازار بورس
        </Link>
        <nav className="flex shrink-0 items-center gap-1">
          {LINKS.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-accent text-white"
                    : "text-muted hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
