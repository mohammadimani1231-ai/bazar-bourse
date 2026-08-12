"use client";

import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { logReturns, pearsonCorrelation } from "@/lib/stats.ts";
import { CHART_COLORS } from "@/lib/chartColors.ts";

export interface AssetSeries {
  name: string;
  points: { date: string; value: number }[];
}

const WINDOWS = [30, 60, 90] as const;
const MIN_POINTS = 15;

function alignedLogReturns(a: AssetSeries, b: AssetSeries, window: number): [number[], number[]] {
  const bByDate = new Map(b.points.map((p) => [p.date, p.value]));
  const commonDates = a.points
    .map((p) => p.date)
    .filter((d) => bByDate.has(d))
    .sort();
  const recent = commonDates.slice(-(window + 1));
  const aByDate = new Map(a.points.map((p) => [p.date, p.value]));
  const aVals = recent.map((d) => aByDate.get(d)!);
  const bVals = recent.map((d) => bByDate.get(d)!);
  return [logReturns(aVals), logReturns(bVals)];
}

export function CorrelationHeatmap({ assets }: { assets: AssetSeries[] }) {
  const [window, setWindow] = useState<(typeof WINDOWS)[number]>(30);

  const { data, insufficientCount } = useMemo(() => {
    const cells: [number, number, number | null][] = [];
    let insufficient = 0;
    for (let i = 0; i < assets.length; i++) {
      for (let j = 0; j < assets.length; j++) {
        if (i === j) {
          cells.push([i, j, 1]);
          continue;
        }
        const [ra, rb] = alignedLogReturns(assets[i], assets[j], window);
        if (ra.length < MIN_POINTS) {
          cells.push([i, j, null]);
          insufficient++;
          continue;
        }
        cells.push([i, j, pearsonCorrelation(ra, rb)]);
      }
    }
    return { data: cells, insufficientCount: insufficient };
  }, [assets, window]);

  const option = {
    backgroundColor: "transparent",
    textStyle: { fontFamily: "var(--font-vazirmatn)" },
    tooltip: {
      formatter: (p: { data: [number, number, number | null] }) => {
        const [i, j, v] = p.data;
        if (v == null) return `${assets[i].name} × ${assets[j].name}: داده کافی نیست`;
        return `${assets[i].name} × ${assets[j].name}: ${v.toFixed(2)}`;
      },
    },
    grid: { left: 90, right: 16, top: 16, bottom: 60 },
    xAxis: {
      type: "category",
      data: assets.map((a) => a.name),
      axisLabel: { color: CHART_COLORS.muted, rotate: 45 },
      splitArea: { show: true },
    },
    yAxis: {
      type: "category",
      data: assets.map((a) => a.name),
      axisLabel: { color: CHART_COLORS.muted },
      splitArea: { show: true },
    },
    visualMap: {
      min: -1,
      max: 1,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      textStyle: { color: CHART_COLORS.muted },
      inRange: { color: [CHART_COLORS.down, CHART_COLORS.surface2, CHART_COLORS.up] },
    },
    series: [
      {
        type: "heatmap",
        data,
        label: { show: false },
        itemStyle: { borderColor: "var(--background)", borderWidth: 1 },
      },
    ],
  };

  return (
    <div className="rounded-lg border border-border bg-surface shadow-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold">همبستگی غلتان (روی لگاریتم بازده)</h2>
        <div className="flex gap-1 text-xs">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`rounded px-2 py-1 ${window === w ? "bg-accent text-white" : "text-muted hover:bg-surface-2"}`}
            >
              {w} روزه
            </button>
          ))}
        </div>
      </div>
      <ReactECharts option={option} opts={{ renderer: "svg" }} style={{ height: 360 }} />
      {insufficientCount > 0 && (
        <p className="mt-2 text-[11px] text-muted">
          {insufficientCount} جفت هنوز داده کافی برای این بازه ندارند (خاکستری).
        </p>
      )}
    </div>
  );
}
