import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Sparkline } from "@/components/Sparkline";
import { formatFaPercent } from "@/lib/format.ts";

export interface StatTileDelta {
  /** درصد یا عدد تغییر — علامتش تعیین‌کنندهٔ جهت فلش است. */
  value: number | null;
  /** آیا صعود این متریک «خوب» است؟ رنگ از این ضرب‌در جهت به دست می‌آید، نه از خودِ علامت
   * به‌تنهایی — طبق بخش ۶ اسپک («رنگ delta بر اساس جهت × آیا صعود خوب است، per-metric»).
   * مثال: برای «بیشترین افت سرمایه»، صعود عدد (افت کمتر) خوب است ولی برای «ریسک» بد است.
   * پیش‌فرض true (متریک‌های قیمتی معمولی). */
  higherIsBetter?: boolean;
  formatter?: (v: number) => string;
}

export interface StatTileProps {
  label: string;
  /** رشتهٔ از‌قبل‌فرمت‌شده — عمداً string نه number، چون فرمت (فارسی/فشرده/...) بسته به داده فرق می‌کند. */
  value: string;
  delta?: StatTileDelta;
  /** هدرو (hero): عدد اصلی ≥۴۸px — طبق اسپک باید دقیقاً یک‌بار در کل صفحه استفاده شود؛
   * این محدودیت در سطح ترکیب صفحه رعایت می‌شود، نه در خودِ کامپوننت. پیش‌فرض false
   * (اندازهٔ فشرده‌تر، برای ردیف چند کارت KPI کنار هم). */
  hero?: boolean;
  sparklineValues?: (number | null)[];
  /** برچسب as-of اجباری این پروژه (CLAUDE.md #۱۳) — معمولاً <AsOfBadge capturedAt=... marketOpen=... />. */
  asOf?: React.ReactNode;
}

/**
 * پیاده‌سازی بخش ۶ bazar-bourse-dataviz-spec.md:
 * - value با فونت proportional (نه tabular — آن برای هم‌ترازی ستون جدول است، این یک عدد تنهاست).
 * - delta همیشه با علامت + فلش/آیکون رنگی (اجباری، نه تزئینی).
 * - RTL: کل عدد داخل .ltr-nums-proportional (value) / .ltr-nums (delta) ایزوله می‌شود.
 */
export function StatTile({ label, value, delta, hero = false, sparklineValues, asOf }: StatTileProps) {
  const deltaValue = delta?.value ?? null;
  const higherIsBetter = delta?.higherIsBetter ?? true;
  const format = delta?.formatter ?? formatFaPercent;

  const direction: "up" | "down" | "flat" = deltaValue == null || deltaValue === 0 ? "flat" : deltaValue > 0 ? "up" : "down";
  const isGood = direction === "flat" ? null : (direction === "up") === higherIsBetter;
  const deltaColorClass = isGood == null ? "text-muted" : isGood ? "text-up-text" : "text-down-text";
  const DeltaIcon = direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : Minus;

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-surface shadow-card p-3">
      {sparklineValues && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-80">
          <Sparkline values={sparklineValues} width={400} height={40} glow responsive />
        </div>
      )}
      <div className="relative flex flex-col gap-1.5">
        <p className="text-xs text-muted">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className={`ltr-nums-proportional text-right font-bold tracking-tight ${hero ? "text-[48px] leading-none" : "text-2xl"}`}>
            {value}
          </p>
          {delta && (
            // اسپک: «همیشه با علامت + فلش/آیکون رنگی» — یعنی هر دو با هم (نه یکی جای دیگری)،
            // چون تکیهٔ صرف به رنگ برای کاربر کوررنگ کافی نیست.
            <span className={`ltr-nums flex items-center gap-0.5 text-xs font-bold ${deltaColorClass}`}>
              <DeltaIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
              {deltaValue == null ? "—" : format(deltaValue)}
            </span>
          )}
        </div>
        {asOf && <div>{asOf}</div>}
      </div>
    </div>
  );
}
