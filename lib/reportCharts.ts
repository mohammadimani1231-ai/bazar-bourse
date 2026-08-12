/**
 * چارت‌های SVG سمت سرور برای گزارش‌های ذخیره‌شده (فاز ۷) — بدون هیچ وابستگی جدید و بدون
 * نیاز به JS کلاینتی، چون گزارش یک رشتهٔ HTML ثابت است که باید روی کاغذ هم درست چاپ شود.
 */

export interface BarDatum {
  label: string;
  value: number;
}

const UP_COLOR = "#22c55e";
const DOWN_COLOR = "#ef4444";
const AXIS_COLOR = "#6b7280";

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** چارت میله‌ای افقی واگرا (مرکز = صفر) — برای دادهٔ مثبت/منفی مثل ورود پول؛ اگر همه مثبت
 * بودند مرکز عملاً لبهٔ چپ می‌شود. */
export function renderBarChartSvg(
  data: BarDatum[],
  options: { width?: number; rowHeight?: number; labelWidth?: number; valueFormatter?: (v: number) => string } = {},
): string {
  const width = options.width ?? 480;
  const rowHeight = options.rowHeight ?? 28;
  const labelWidth = options.labelWidth ?? 90;
  const valueFormatter = options.valueFormatter ?? ((v: number) => v.toFixed(0));

  if (data.length === 0) {
    return `<svg width="${width}" height="40" xmlns="http://www.w3.org/2000/svg"><text x="8" y="24" font-size="12" fill="${AXIS_COLOR}">داده‌ای نیست</text></svg>`;
  }

  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const plotWidth = width - labelWidth - 80;
  const centerX = labelWidth + plotWidth / 2;
  const height = data.length * rowHeight + 10;

  const bars = data
    .map((d, i) => {
      const y = i * rowHeight + 5;
      const barWidth = (Math.abs(d.value) / maxAbs) * (plotWidth / 2);
      const x = d.value >= 0 ? centerX : centerX - barWidth;
      const color = d.value >= 0 ? UP_COLOR : DOWN_COLOR;
      const valueX = d.value >= 0 ? centerX + barWidth + 6 : centerX - barWidth - 6;
      const valueAnchor = d.value >= 0 ? "start" : "end";
      return `
        <text x="${labelWidth - 8}" y="${y + rowHeight / 2 + 4}" font-size="11" fill="#e8e8ec" text-anchor="end">${escapeXml(d.label)}</text>
        <rect x="${x}" y="${y}" width="${Math.max(1, barWidth)}" height="${rowHeight - 8}" fill="${color}" rx="2" />
        <text x="${valueX}" y="${y + rowHeight / 2 + 4}" font-size="10" fill="${AXIS_COLOR}" text-anchor="${valueAnchor}">${escapeXml(valueFormatter(d.value))}</text>
      `;
    })
    .join("");

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" font-family="Tahoma, sans-serif">
    <line x1="${centerX}" y1="0" x2="${centerX}" y2="${height}" stroke="${AXIS_COLOR}" stroke-width="1" />
    ${bars}
  </svg>`;
}

export interface LinePoint {
  x: string;
  y: number;
}

/** خط ساده (sparkline) — برای سری‌های زمانی کوتاه مثل tension_index یک هفته. */
export function renderLineChartSvg(points: LinePoint[], options: { width?: number; height?: number; color?: string } = {}): string {
  const width = options.width ?? 480;
  const height = options.height ?? 120;
  const color = options.color ?? "#6366f1";
  const padding = 20;

  const validPoints = points.filter((p) => Number.isFinite(p.y));
  if (validPoints.length < 2) {
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><text x="8" y="${height / 2}" font-size="12" fill="${AXIS_COLOR}">داده‌ای کافی نیست</text></svg>`;
  }

  const values = validPoints.map((p) => p.y);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const coords = validPoints.map((p, i) => {
    const x = padding + (i / (validPoints.length - 1)) * plotWidth;
    const y = padding + plotHeight - ((p.y - min) / range) * plotHeight;
    return [x, y] as const;
  });

  const pathD = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const firstLabel = validPoints[0].x;
  const lastLabel = validPoints[validPoints.length - 1].x;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" font-family="Tahoma, sans-serif">
    <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" />
    <text x="${padding}" y="${height - 4}" font-size="10" fill="${AXIS_COLOR}">${escapeXml(firstLabel)}</text>
    <text x="${width - padding}" y="${height - 4}" font-size="10" fill="${AXIS_COLOR}" text-anchor="end">${escapeXml(lastLabel)}</text>
  </svg>`;
}

export interface NamedLineSeries {
  label: string;
  color: string;
  points: LinePoint[];
}

/**
 * چند سری روی محور مشترک — برای مقایسهٔ منحنی سرمایهٔ پرتفوی مجازی با بنچمارک‌ها.
 * محور y مشترک است (همهٔ سری‌ها از قبل روی یک سرمایهٔ اولیه هم‌مقیاس شده‌اند)، و محور
 * زمان مثل بقیهٔ چارت‌های پروژه چپ→راست می‌ماند حتی در صفحهٔ RTL (قید #۱۲).
 */
export function renderMultiLineChartSvg(
  series: NamedLineSeries[],
  options: { width?: number; height?: number } = {},
): string {
  const width = options.width ?? 720;
  const height = options.height ?? 240;
  const padding = 24;

  const usable = series.filter((s) => s.points.filter((p) => Number.isFinite(p.y)).length >= 2);
  if (usable.length === 0) {
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><text x="8" y="${height / 2}" font-size="12" fill="${AXIS_COLOR}">داده‌ای کافی نیست</text></svg>`;
  }

  const allValues = usable.flatMap((s) => s.points.map((p) => p.y)).filter((v) => Number.isFinite(v));
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2 - 16; // ۱۶ برای ردیف راهنما پایین

  const paths = usable
    .map((s) => {
      const valid = s.points.filter((p) => Number.isFinite(p.y));
      const d = valid
        .map((p, i) => {
          const x = padding + (i / (valid.length - 1)) * plotWidth;
          const y = padding + plotHeight - ((p.y - min) / range) * plotHeight;
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" />`;
    })
    .join("");

  const legend = usable
    .map((s, i) => {
      const x = padding + i * 150;
      const y = height - 4;
      return `<rect x="${x}" y="${y - 8}" width="10" height="3" fill="${s.color}" /><text x="${x + 14}" y="${y}" font-size="10" fill="${AXIS_COLOR}">${escapeXml(s.label)}</text>`;
    })
    .join("");

  const first = usable[0].points[0]?.x ?? "";
  const last = usable[0].points[usable[0].points.length - 1]?.x ?? "";

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" font-family="Tahoma, sans-serif">
    ${paths}
    <text x="${padding}" y="${padding + plotHeight + 12}" font-size="10" fill="${AXIS_COLOR}">${escapeXml(first)}</text>
    <text x="${width - padding}" y="${padding + plotHeight + 12}" font-size="10" fill="${AXIS_COLOR}" text-anchor="end">${escapeXml(last)}</text>
    ${legend}
  </svg>`;
}
