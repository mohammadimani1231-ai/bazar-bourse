"use client";

import ReactECharts from "echarts-for-react";
import type { CcfPoint } from "@/lib/stats.ts";

export interface LeadLagPair {
  label: string;
  points: CcfPoint[];
  best: CcfPoint | null;
}

function PairChart({ pair }: { pair: LeadLagPair }) {
  if (pair.points.length === 0 || pair.points.every((p) => p.correlation == null)) {
    return (
      <div>
        <p className="mb-1 text-xs text-muted">{pair.label}</p>
        <p className="text-xs text-muted">داده کافی برای محاسبهٔ CCF نیست.</p>
      </div>
    );
  }

  const option = {
    backgroundColor: "transparent",
    textStyle: { fontFamily: "var(--font-vazirmatn)" },
    grid: { left: 48, right: 16, top: 16, bottom: 28 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      name: "لگ (روز)",
      data: pair.points.map((p) => p.lag),
      axisLine: { lineStyle: { color: "#2a2a33" } },
      axisLabel: { color: "#9a9aa5" },
    },
    yAxis: {
      type: "value",
      min: -1,
      max: 1,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: "#2a2a33" } },
      axisLabel: { color: "#9a9aa5" },
    },
    series: [
      {
        type: "bar",
        data: pair.points.map((p) => ({
          value: p.correlation,
          itemStyle: { color: p.lag === pair.best?.lag ? "#6366f1" : "#3a3a44" },
        })),
      },
    ],
  };

  return (
    <div>
      <p className="mb-1 text-xs text-muted">
        {pair.label}
        {pair.best && (
          <span className="mr-2 text-accent">
            لگ بهینه: {pair.best.lag} روز (همبستگی {pair.best.correlation?.toFixed(2)})
          </span>
        )}
      </p>
      <ReactECharts option={option} style={{ height: 200 }} />
    </div>
  );
}

export function LeadLagPanel({ pairs }: { pairs: LeadLagPair[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface shadow-card p-3">
      <h2 className="mb-2 text-sm font-bold">تحلیل lead-lag (CCF، لگ ±۱۵ روز)</h2>
      <div className="flex flex-col gap-4">
        {pairs.map((pair) => (
          <PairChart key={pair.label} pair={pair} />
        ))}
      </div>
    </div>
  );
}
