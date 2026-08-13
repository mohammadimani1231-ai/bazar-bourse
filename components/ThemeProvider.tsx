"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

/**
 * تم پیش‌فرض روشن است (طبق design_handoff_dashboard_redesign/README.md) با سوییچ اختیاری به
 * تاریک. مقدار اولیه را از data-theme روی <html> می‌خواند که یک اسکریپت inline در layout.tsx
 * پیش از هیدریشن (و پیش از اولین رنگ‌آمیزی) از localStorage ست کرده — بدون آن اسکریپت، یک
 * فلش تم غلط (FOUC) بین رندر سرور و هیدریشن کلاینت دیده می‌شد.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof document === "undefined") return "light";
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme باید داخل ThemeProvider استفاده شود");
  return ctx;
}
