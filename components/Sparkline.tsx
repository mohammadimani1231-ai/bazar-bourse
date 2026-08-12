import { useId } from "react";
import { CHART_COLORS } from "@/lib/chartColors.ts";

/**
 * نمودار مینیمال بدون محور/شبکه/تولتیپ — برای ردیف‌های لیست (واچ‌لیست، اسکرینر)،
 * الهام از Robinhood. رنگ خط از روی علامت بازدهٔ کل بازه (شروع تا پایان) تعیین می‌شود؛
 * SVG خالص، بدون کتابخانهٔ چارت — برای دهها ردیف هم‌زمان در یک جدول سبک بماند.
 *
 * `glow` (اختیاری، پیش‌فرض خاموش): پرشدگی گرادیانی زیر خط، الهام از کارت‌های روند
 * TradingView/Trade Ideas که در بازبینی مراجع جهانی (۲۰۲۶-۰۸-۱۲) بررسی شدند — برای
 * جاهایی که این sparkline تنها عنصر اصلی کارت است (مثل هدر شاخص کل)، نه ردیف‌های ریز جدول.
 * `useId` چون ممکن است چند sparkline هم‌زمان روی یک صفحه رندر شوند و id گرادیان/کلیپ
 * نباید تصادفاً با هم تداخل کند.
 */
export function Sparkline({
  values,
  width = 80,
  height = 28,
  glow = false,
  responsive = false,
}: {
  values: (number | null)[];
  width?: number;
  height?: number;
  glow?: boolean;
  /** به‌جای اندازهٔ ثابت پیکسلی، کل کانتینر والد را پر می‌کند (width/height فقط برای محاسبهٔ
   * مختصات داخلی/نسبت تصویر استفاده می‌شوند) — برای پس‌زمینهٔ کارت، نه ردیف جدول. */
  responsive?: boolean;
}) {
  const rawId = useId();
  const gradientId = `spark-glow-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
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
    return [x, y] as const;
  });
  const coordStr = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  const color = points[points.length - 1] >= points[0] ? CHART_COLORS.up : CHART_COLORS.down;

  const areaPath = glow
    ? `M${coords[0][0].toFixed(1)},${height} L${coordStr.replace(/ /g, " L")} L${coords[coords.length - 1][0].toFixed(1)},${height} Z`
    : null;

  return (
    <svg
      width={responsive ? "100%" : width}
      height={responsive ? "100%" : height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={responsive ? "none" : undefined}
      className="ltr-nums"
      aria-hidden="true"
    >
      {glow && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />}
      <polyline points={coordStr} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
