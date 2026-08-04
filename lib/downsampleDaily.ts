import { tehranDayBounds } from "./time/tehranDay.ts";

export interface TimestampedValue {
  value: number | null;
  captured_at: string;
}

export interface DailyValue {
  date: string;
  value: number;
}

/** یک سری زمانی چند-باره-در-روز (مثل global_quotes) را به یک نقطه در روز (آخرین مقدار همان روز تهران) تبدیل می‌کند. */
export function downsampleToDaily(rows: TimestampedValue[]): DailyValue[] {
  const byDay = new Map<string, { value: number; capturedAt: string }>();
  for (const row of rows) {
    if (row.value == null) continue;
    const date = tehranDayBounds(new Date(row.captured_at)).date;
    const existing = byDay.get(date);
    if (!existing || row.captured_at > existing.capturedAt) {
      byDay.set(date, { value: row.value, capturedAt: row.captured_at });
    }
  }
  return [...byDay.entries()]
    .map(([date, v]) => ({ date, value: v.value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
