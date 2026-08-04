"use client";

import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { formatJalaliDay } from "@/lib/jalali.ts";
import { formatFaNumber } from "@/lib/format.ts";

export interface SeriesInput {
  name: string;
  color: string;
  points: { date: string; value: number }[];
}

const RANGE_OPTIONS: { label: string; days: number | null }[] = [
  { label: "۳۰ روز", days: 30 },
  { label: "۹۰ روز", days: 90 },
  { label: "۱۸۰ روز", days: 180 },
  { label: "۱ سال", days: 365 },
  { label: "همه", days: null },
];

export function RebaseChart({ series }: { series: SeriesInput[] }) {
  const [rangeDays, setRangeDays] = useState<number | null>(90);

  const { xAxisDates, chartSeries } = useMemo(() => {
    const cutoff = rangeDays == null ? null : new Date().getTime() - rangeDays * 86_400_000;
    const sliced = series.map((s) => ({
      ...s,
      points: cutoff == null ? s.points : s.points.filter((p) => Date.parse(p.date) >= cutoff),
    }));

    const dateSet = new Set<string>();
    sliced.forEach((s) => s.points.forEach((p) => dateSet.add(p.date)));
    const dates = [...dateSet].sort();

    const chartSeries = sliced.map((s) => {
      const base = s.points[0]?.value;
      const byDate = new Map(s.points.map((p) => [p.date, p.value]));
      return {
        name: s.name,
        type: "line" as const,
        showSymbol: false,
        color: s.color,
        data: dates.map((d) => {
          const v = byDate.get(d);
          return v == null || !base ? null : Number(((v / base) * 100).toFixed(2));
        }),
      };
    });

    return { xAxisDates: dates, chartSeries };
  }, [series, rangeDays]);

  const option = {
    backgroundColor: "transparent",
    textStyle: { fontFamily: "var(--font-vazirmatn)" },
    grid: { left: 48, right: 16, top: 40, bottom: 40 },
    legend: { top: 0, textStyle: { color: "#9a9aa5" }, data: chartSeries.map((s) => s.name) },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v: number) => (v == null ? "—" : formatFaNumber(v, 1)),
    },
    xAxis: {
      type: "category",
      data: xAxisDates.map((d) => formatJalaliDay(d + "T00:00:00Z")),
      axisLine: { lineStyle: { color: "#2a2a33" } },
      axisLabel: { color: "#9a9aa5", fontSize: 10 },
    },
    yAxis: {
      type: "value",
      name: "rebase = 100",
      axisLine: { show: false },
      splitLine: { lineStyle: { color: "#2a2a33" } },
      axisLabel: { color: "#9a9aa5", formatter: (v: number) => formatFaNumber(v) },
    },
    series: chartSeries,
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold">مقایسهٔ rebase-به-۱۰۰</h2>
        <div className="flex gap-1 text-xs">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => setRangeDays(opt.days)}
              className={`rounded px-2 py-1 ${rangeDays === opt.days ? "bg-accent text-white" : "text-muted hover:bg-surface-2"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {xAxisDates.length === 0 ? (
        <p className="text-xs text-muted">داده‌ای در این بازه نیست.</p>
      ) : (
        <ReactECharts option={option} style={{ height: 360 }} />
      )}
    </div>
  );
}
