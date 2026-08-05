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
  foreground: "#e4e6eb",
  muted: "#868b98",
  border: "#2b303f",
  surface2: "#232735",
  neutral: "#3d4254",
} as const;

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}
