/**
 * رنگ‌های چارت‌ها (lightweight-charts/ECharts روی canvas اجرا می‌شوند و نمی‌توانند
 * var(--up) زندهٔ CSS را بخوانند، پس این‌ها باید مقدار ثابت باشند) — منبع واحد به‌جای
 * پخش‌شدن hex در هر کامپوننت چارت؛ باید دقیقاً با app/globals.css هم‌گام بمانند.
 */
export const CHART_COLORS = {
  up: "#22c55e",
  down: "#ef4444",
  warning: "#eab308",
  accent: "#6366f1",
  foreground: "#e8e8ec",
  muted: "#9a9aa5",
  border: "#2a2a33",
  surface2: "#1b1b22",
  neutral: "#3a3a44",
} as const;

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}
