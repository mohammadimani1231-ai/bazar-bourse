export interface ScreenerRow {
  symbol: string;
  companyName: string | null;
  industry: string;
  tradeValue: number | null;
  rsi14: number | null;
  compositeRank: number | null;
  maDistancePct: number | null;
  buyerPower: number | null;
  moneyFlow: number | null;
  suspiciousVolume: boolean | null;
  /** آخرین ~۲۰ قیمت پایانی تعدیل‌شده، صعودی زمانی — برای اسپارک‌لاین ردیف؛ اختیاری، اگر نبود «—» نشان داده می‌شود. */
  recentCloses?: number[];
}

export interface RangeFilter {
  min: number | null;
  max: number | null;
}

export interface ScreenerFilters {
  industries: string[]; // خالی = همه صنایع
  tradeValue: RangeFilter;
  rsi: RangeFilter;
  compositeRank: RangeFilter;
  maDistance: RangeFilter;
  buyerPower: RangeFilter;
  moneyFlow: RangeFilter;
  suspiciousVolume: "any" | "only" | "exclude";
}

export const EMPTY_RANGE: RangeFilter = { min: null, max: null };

export const DEFAULT_SCREENER_FILTERS: ScreenerFilters = {
  industries: [],
  tradeValue: EMPTY_RANGE,
  rsi: EMPTY_RANGE,
  compositeRank: EMPTY_RANGE,
  maDistance: EMPTY_RANGE,
  buyerPower: EMPTY_RANGE,
  moneyFlow: EMPTY_RANGE,
  suspiciousVolume: "any",
};

function inRange(value: number | null, range: RangeFilter): boolean {
  if (value == null) return range.min == null && range.max == null;
  if (range.min != null && value < range.min) return false;
  if (range.max != null && value > range.max) return false;
  return true;
}

export function applyScreenerFilters(rows: ScreenerRow[], filters: ScreenerFilters): ScreenerRow[] {
  return rows.filter((row) => {
    if (filters.industries.length > 0 && !filters.industries.includes(row.industry)) return false;
    if (!inRange(row.tradeValue, filters.tradeValue)) return false;
    if (!inRange(row.rsi14, filters.rsi)) return false;
    if (!inRange(row.compositeRank, filters.compositeRank)) return false;
    if (!inRange(row.maDistancePct, filters.maDistance)) return false;
    if (!inRange(row.buyerPower, filters.buyerPower)) return false;
    if (!inRange(row.moneyFlow, filters.moneyFlow)) return false;
    if (filters.suspiciousVolume === "only" && row.suspiciousVolume !== true) return false;
    if (filters.suspiciousVolume === "exclude" && row.suspiciousVolume === true) return false;
    return true;
  });
}
