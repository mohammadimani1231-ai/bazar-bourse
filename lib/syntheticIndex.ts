export interface DatedValue {
  date: string;
  value: number;
}

/**
 * شاخص ترکیبی هم‌وزن از چند سری قیمت (مثلا نمادهای یک صنعت) — چون نمادها سطح قیمتی
 * خیلی متفاوتی دارند، هر سری قبل از میانگین‌گیری به ۱۰۰ در اولین تاریخ مشترک rebase می‌شود.
 * فقط تاریخ‌هایی که در همهٔ سری‌ها حضور دارند لحاظ می‌شوند (اشتراک، نه اجتماع).
 */
export function buildEqualWeightIndex(seriesPerSymbol: DatedValue[][]): DatedValue[] {
  const nonEmpty = seriesPerSymbol.filter((s) => s.length > 0);
  if (nonEmpty.length === 0) return [];

  const dateSets = nonEmpty.map((s) => new Set(s.map((p) => p.date)));
  const commonDates = [...dateSets[0]]
    .filter((date) => dateSets.every((set) => set.has(date)))
    .sort();
  if (commonDates.length === 0) return [];

  const firstDate = commonDates[0];
  const rebasedSeries = nonEmpty.map((series) => {
    const byDate = new Map(series.map((p) => [p.date, p.value]));
    const base = byDate.get(firstDate)!;
    return { byDate, base };
  });

  return commonDates.map((date) => {
    const values = rebasedSeries.map(({ byDate, base }) => (byDate.get(date)! / base) * 100);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return { date, value: avg };
  });
}
