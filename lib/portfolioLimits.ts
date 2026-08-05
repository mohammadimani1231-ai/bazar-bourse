export interface OpenPosition {
  symbol: string;
  industry: string | null;
  positionValue: number;
}

export interface SymbolCorrelation {
  symbol: string;
  /** از lib/stats.ts::pearsonCorrelation روی بازده لگاریتمی روزانه — محاسبه‌اش بیرون این تابع است. */
  correlation: number | null;
}

export interface PortfolioLimitsInput {
  newIndustry: string | null;
  newPositionValue: number;
  openPositions: OpenPosition[];
  totalCapital: number;
  maxConcurrentPositions: number;
  maxSectorExposurePct: number;
  correlations?: SymbolCorrelation[];
  correlationThreshold?: number;
}

export interface PortfolioLimitsResult {
  warnings: string[];
  /** محدودیت سخت نقض شده (تعداد پوزیشن‌های هم‌زمان) — بقیه فقط هشدارند، نه رد. */
  blocked: boolean;
}

const DEFAULT_CORRELATION_THRESHOLD = 0.7;

/**
 * محدودیت‌های سطح پرتفوی را چک می‌کند (نه اجرا). فقط سقف تعداد پوزیشن هم‌زمان «سخت» است؛
 * تمرکز صنعتی و همبستگی فقط هشدار می‌دهند — تصمیم نهایی همیشه با کاربر است.
 */
export function checkPortfolioLimits(input: PortfolioLimitsInput): PortfolioLimitsResult {
  const {
    newIndustry,
    newPositionValue,
    openPositions,
    totalCapital,
    maxConcurrentPositions,
    maxSectorExposurePct,
    correlations = [],
    correlationThreshold = DEFAULT_CORRELATION_THRESHOLD,
  } = input;

  const warnings: string[] = [];

  const blocked = openPositions.length >= maxConcurrentPositions;
  if (blocked) {
    warnings.push(`تعداد پوزیشن‌های باز (${openPositions.length}) به سقف مجاز (${maxConcurrentPositions}) رسیده است`);
  }

  if (totalCapital > 0 && newIndustry) {
    const sectorValue =
      openPositions.filter((p) => p.industry === newIndustry).reduce((sum, p) => sum + p.positionValue, 0) +
      newPositionValue;
    const sectorPct = (sectorValue / totalCapital) * 100;
    if (sectorPct > maxSectorExposurePct) {
      warnings.push(
        `با این پوزیشن، ${sectorPct.toFixed(1)}٪ سرمایه در صنعت «${newIndustry}» متمرکز می‌شود، بیش از سقف ${maxSectorExposurePct}٪`,
      );
    }
  }

  for (const { symbol, correlation } of correlations) {
    if (correlation != null && Math.abs(correlation) >= correlationThreshold) {
      warnings.push(
        `همبستگی این نماد با پوزیشن باز «${symbol}» بالاست (${correlation.toFixed(2)}) — تنوع واقعی کمتر از ظاهر است`,
      );
    }
  }

  return { warnings, blocked };
}
