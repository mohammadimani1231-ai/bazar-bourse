import { CHART_COLORS } from "@/lib/chartColors.ts";

/**
 * نمودار مینیمال بدون محور/شبکه/تولتیپ — برای ردیف‌های لیست (واچ‌لیست، اسکرینر)،
 * الهام از Robinhood. رنگ خط از روی علامت بازدهٔ کل بازه (شروع تا پایان) تعیین می‌شود؛
 * SVG خالص، بدون کتابخانهٔ چارت — برای دهها ردیف هم‌زمان در یک جدول سبک بماند.
 *
 * پیاده‌سازی «گزینهٔ الف» بخش ۵ bazar-bourse-dataviz-spec.md: خط جهت‌رنگ، marker انتهایی
 * پر (فقط وقتی `glow` باشد — رجوع به کامنت زیر)، area fill تخت (نه گرادیان محو، طبق اسپک
 * «opacity ~۱۰٪»)، بدون grid/axis، حداقل ۱۲ نقطه وگرنه نشانهٔ «داده ناکافی».
 *
 * `glow` (اختیاری، پیش‌فرض خاموش): علاوه بر area fill، حالا marker انتهایی را هم فعال
 * می‌کند — چون این دو با هم فقط برای جایی معنا دارند که sparkline تنها عنصر اصلی کارت است
 * (مثل هدر شاخص کل)، نه ردیف‌های ریز جدول اسکرینر (۶۴×۲۲px) که یک نقطهٔ ۴px نسبت به
 * ارتفاعش زیادی بزرگ/شلوغ می‌شود.
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
  const points = values.filter((v): v is number => v != null && Number.isFinite(v));

  // اسپک: کمتر از ۱۲ نقطه یعنی «داده ناکافی» — نه خط ناقص/گمراه‌کننده.
  if (points.length < 12) {
    return <span className="text-[10px] text-muted">داده ناکافی</span>;
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
  const [lastX, lastY] = coords[coords.length - 1];

  const areaPath = glow
    ? `M${coords[0][0].toFixed(1)},${height} L${coordStr.replace(/ /g, " L")} L${lastX.toFixed(1)},${height} Z`
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
      {areaPath && <path d={areaPath} fill={color} fillOpacity={0.1} stroke="none" />}
      <polyline points={coordStr} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {glow && <circle cx={lastX} cy={lastY} r={4} fill={color} />}
    </svg>
  );
}
