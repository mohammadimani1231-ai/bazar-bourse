/**
 * رنگ‌های چارت‌ها (lightweight-charts/ECharts هرچند حالا svg-renderer دارند، مقادیرشان را
 * از option جاوااسکریپتی می‌گیرند نه CSS زنده، پس نمی‌توانند var(--up) را در زمان اجرا بخوانند
 * — این‌ها باید مقدار ثابت باشند) — منبع واحد به‌جای پخش‌شدن hex در هر کامپوننت چارت؛ باید
 * دقیقاً با app/globals.css هم‌گام بمانند.
 *
 * از نسخهٔ هیبرید (۲۰۲۶-۰۸-۱۲، کارت‌ها روشن‌اند) این مقادیر برای کارت روشن بازتنظیم شدند —
 * همان اعداد app/globals.css، نه چیز جدا.
 */
export const CHART_COLORS = {
  up: "#16a34a",
  down: "#dc2626",
  warning: "#b45309",
  accent: "#6366f1",
  foreground: "#15171e",
  muted: "#6b7280",
  border: "#e3e5eb",
  surface2: "#f2f3f6",
  neutral: "#cbd0d9",
} as const;

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}
