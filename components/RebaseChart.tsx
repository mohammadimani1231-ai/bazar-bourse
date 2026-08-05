"use client";

import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { formatJalaliDay } from "@/lib/jalali.ts";
import { formatFaNumber } from "@/lib/format.ts";
import { CHART_COLORS } from "@/lib/chartColors.ts";

export interface SeriesInput {
  name: string;
  color: string;
  points: { date: string; value: number }[];
}

export interface NewsMarkerInput {
  date: string;
  title: string;
  url: string;
}

const RANGE_OPTIONS: { label: string; days: number | null }[] = [
  { label: "۳۰ روز", days: 30 },
  { label: "۹۰ روز", days: 90 },
  { label: "۱۸۰ روز", days: 180 },
  { label: "۱ سال", days: 365 },
  { label: "همه", days: null },
];

export function RebaseChart({ series, newsMarkers = [] }: { series: SeriesInput[]; newsMarkers?: NewsMarkerInput[] }) {
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

    const newsByDate = new Map<string, NewsMarkerInput>();
    for (const n of newsMarkers) {
      if (dateSet.has(n.date) && !newsByDate.has(n.date)) newsByDate.set(n.date, n);
    }
    const markLineData = [...newsByDate.entries()].map(([date, n]) => ({
      xAxis: formatJalaliDay(date + "T00:00:00Z"),
      label: { formatter: "خبر", color: CHART_COLORS.accent, fontSize: 9 },
      lineStyle: { color: CHART_COLORS.accent, type: "dashed" as const, width: 1 },
      newsUrl: n.url,
      newsTitle: n.title,
    }));

    const chartSeries = sliced.map((s, i) => {
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
        ...(i === 0 && markLineData.length > 0
          ? { markLine: { symbol: "none", data: markLineData, silent: false } }
          : {}),
      };
    });

    return { xAxisDates: dates, chartSeries };
  }, [series, rangeDays, newsMarkers]);

  const option = {
    backgroundColor: "transparent",
    textStyle: { fontFamily: "var(--font-vazirmatn)" },
    grid: { left: 48, right: 16, top: 40, bottom: 40 },
    legend: { top: 0, textStyle: { color: CHART_COLORS.muted }, data: chartSeries.map((s) => s.name) },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v: number) => (v == null ? "—" : formatFaNumber(v, 1)),
    },
    xAxis: {
      type: "category",
      data: xAxisDates.map((d) => formatJalaliDay(d + "T00:00:00Z")),
      axisLine: { lineStyle: { color: CHART_COLORS.border } },
      axisLabel: { color: CHART_COLORS.muted, fontSize: 10 },
    },
    yAxis: {
      type: "value",
      name: "rebase = 100",
      axisLine: { show: false },
      splitLine: { lineStyle: { color: CHART_COLORS.border } },
      axisLabel: { color: CHART_COLORS.muted, formatter: (v: number) => formatFaNumber(v) },
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
        <ReactECharts
          option={option}
          style={{ height: 360 }}
          onEvents={{
            click: (params: { componentType?: string; data?: { newsUrl?: string } }) => {
              if (params.componentType === "markLine" && params.data?.newsUrl) {
                window.open(params.data.newsUrl, "_blank", "noopener,noreferrer");
              }
            },
          }}
        />
      )}
      {newsMarkers.length > 0 && (
        <p className="mt-2 text-[11px] text-muted">خط‌چین آبی «خبر» = رویداد ژئوپلیتیک/اقتصادی — کلیک برای لینک.</p>
      )}
    </div>
  );
}
