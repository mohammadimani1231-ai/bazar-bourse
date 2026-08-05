import { CHART_COLORS } from "@/lib/chartColors.ts";

/**
 * نمودار مینیمال بدون محور/شبکه/تولتیپ — برای ردیف‌های لیست (واچ‌لیست، اسکرینر)،
 * الهام از Robinhood. رنگ خط از روی علامت بازدهٔ کل بازه (شروع تا پایان) تعیین می‌شود؛
 * SVG خالص، بدون کتابخانهٔ چارت — برای دهها ردیف هم‌زمان در یک جدول سبک بماند.
 */
export function Sparkline({
  values,
  width = 80,
  height = 28,
}: {
  values: (number | null)[];
  width?: number;
  height?: number;
}) {
  const points = values.filter((v): v is number => v != null && Number.isFinite(v));

  if (points.length < 2) {
    return <span className="text-[10px] text-muted">—</span>;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);

  const coords = points.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const color = points[points.length - 1] >= points[0] ? CHART_COLORS.up : CHART_COLORS.down;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="ltr-nums" aria-hidden="true">
      <polyline points={coords.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
