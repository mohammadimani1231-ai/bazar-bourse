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

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" font-family="Vazirmatn, sans-serif">
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

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" font-family="Vazirmatn, sans-serif">
    <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" />
    <text x="${padding}" y="${height - 4}" font-size="10" fill="${AXIS_COLOR}">${escapeXml(firstLabel)}</text>
    <text x="${width - padding}" y="${height - 4}" font-size="10" fill="${AXIS_COLOR}" text-anchor="end">${escapeXml(lastLabel)}</text>
  </svg>`;
}
