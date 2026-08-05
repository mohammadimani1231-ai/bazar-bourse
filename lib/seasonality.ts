import { jalaliMonthOf, jalaliMonthName } from "./jalaliMonth.ts";
import { dailyPctChanges } from "./tension.ts";

export interface SeasonalityPoint {
  date: string;
  value: number;
}

export interface MonthSeasonality {
  month: number;
  monthName: string;
  avgReturnPct: number | null;
  sampleSize: number;
}

/** میانگین بازده روزانه به تفکیک ماه شمسی — برای فصلی‌نگری چند سالهٔ یک نماد. */
export function computeJalaliSeasonality(candles: SeasonalityPoint[]): MonthSeasonality[] {
  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  const changes = dailyPctChanges(sorted.map((c) => c.value));
  // dailyPctChanges[i] بازده روز sorted[i+1] نسبت به sorted[i] است
  const byMonth = new Map<number, number[]>();
  for (let i = 0; i < changes.length; i++) {
    const month = jalaliMonthOf(sorted[i + 1].date);
    const list = byMonth.get(month) ?? [];
    list.push(changes[i]);
    byMonth.set(month, list);
  }

  const result: MonthSeasonality[] = [];
  for (let month = 1; month <= 12; month++) {
    const returns = byMonth.get(month) ?? [];
    result.push({
      month,
      monthName: jalaliMonthName(month),
      avgReturnPct: returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : null,
      sampleSize: returns.length,
    });
  }
  return result;
}
