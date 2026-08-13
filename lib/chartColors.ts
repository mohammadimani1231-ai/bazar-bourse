/**
 * رنگ‌های چارت‌ها — دو دسته:
 *
 * ۱) اکثر کامپوننت‌های ECharts (renderer:"svg") مستقیماً رشتهٔ `"var(--up)"` و مشابه را در
 *    option پاس می‌دهند (نه از این فایل) — چون svg renderer عنصر DOM واقعی می‌سازد و var()
 *    از طریق کسکید CSS حل می‌شود، خودکار تم روشن/تاریک را دنبال می‌کند (الگویی که از قبل در
 *    CorrelationHeatmap/MarketTreemap با borderColor:"var(--background)" تأیید شده بود).
 *
 * ۲) این فایل فقط برای دو استثنای واقعی لازم است که به مقدار HEX/RGB واقعی نیاز دارند، نه
 *    رشتهٔ var():
 *    - lightweight-charts (CandleChart) کاملاً canvas-محور است، هیچ CSS نمی‌بیند.
 *    - محاسبهٔ رنگ میان‌یابی‌شده در JS (MarketTreemap::mixColor، CorrelationHeatmap::visualMap
 *      که خودِ ECharts باید بین چند stop رنگ را عددی interpolate کند).
 *    مقادیر HEX زیر دقیقاً از همان فرمول‌های oklch در app/globals.css محاسبه شدند (تبدیل
 *    OKLab→sRGB با اسکریپت Node، نه حدسی) — باید هر دو فایل هم‌گام بمانند.
 */
export interface ChartColorSet {
  up: string;
  down: string;
  warning: string;
  accent: string;
  foreground: string;
  muted: string;
  border: string;
  surface2: string;
  neutral: string;
}

const LIGHT: ChartColorSet = {
  up: "#009746",
  down: "#df2225",
  warning: "#a36000",
  accent: "#0085cd",
  foreground: "#13161a",
  muted: "#54595e",
  border: "#dbdee3",
  surface2: "#ecf1f5",
  neutral: "#dbdee3",
};

const DARK: ChartColorSet = {
  up: "#00cc73",
  down: "#ff4d46",
  warning: "#e49e22",
  accent: "#00abf1",
  foreground: "#f0f2f4",
  muted: "#9b9fa3",
  border: "#33393e",
  surface2: "#22272c",
  neutral: "#33393e",
};

export function getChartColors(isDark: boolean): ChartColorSet {
  return isDark ? DARK : LIGHT;
}

/** پیش‌فرض روشن — برای جاهایی که (هنوز) به تم فعلی دسترسی ندارند. ترجیحاً getChartColors را
 * با isDark واقعی از useTheme() صدا بزنید. */
export const CHART_COLORS = LIGHT;

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}
