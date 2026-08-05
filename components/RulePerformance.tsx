"use client";

import ReactECharts from "echarts-for-react";
import { LineChart } from "lucide-react";
import { formatFaNumber, formatFaPercent } from "@/lib/format.ts";
import { CHART_COLORS } from "@/lib/chartColors.ts";
import { EmptyState } from "@/components/EmptyState";
import type { RuleStat } from "@/lib/ruleStats.ts";

export interface ScorePoint {
  score: number;
  returnPct: number;
}

export function RulePerformance({ stats, scorePoints }: { stats: RuleStat[]; scorePoints: ScorePoint[] }) {
  const scatterOption = {
    backgroundColor: "transparent",
    textStyle: { fontFamily: "var(--font-vazirmatn)" },
    grid: { left: 56, right: 16, top: 24, bottom: 40 },
    tooltip: {
      formatter: (p: { data: [number, number] }) => `score: ${p.data[0]} — بازده ۵روزه: ${p.data[1].toFixed(2)}٪`,
    },
    xAxis: {
      name: "score",
      nameLocation: "middle",
      nameGap: 28,
      axisLine: { lineStyle: { color: CHART_COLORS.border } },
      axisLabel: { color: CHART_COLORS.muted, formatter: (v: number) => formatFaNumber(v) },
      splitLine: { lineStyle: { color: CHART_COLORS.border } },
    },
    yAxis: {
      name: "بازده ۵روزه (٪)",
      axisLine: { lineStyle: { color: CHART_COLORS.border } },
      axisLabel: { color: CHART_COLORS.muted, formatter: (v: number) => formatFaNumber(v) },
      splitLine: { lineStyle: { color: CHART_COLORS.border } },
    },
    series: [
      {
        type: "scatter",
        symbolSize: 8,
        data: scorePoints.map((p) => [p.score, p.returnPct]),
        itemStyle: { color: CHART_COLORS.accent, opacity: 0.7 },
      },
    ],
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-surface p-3">
        <h2 className="mb-2 text-sm font-bold">عملکرد هر قانون</h2>
        {stats.length === 0 ? (
          <EmptyState
            icon={LineChart}
            title="هنوز سیگنالی evaluate نشده"
            description="این تب وقتی معنادار می‌شود که signal_outcomes داده داشته باشد."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="p-2 text-right">قانون</th>
                  <th className="p-2 text-right">تعداد</th>
                  <th className="p-2 text-right">win rate</th>
                  <th className="p-2 text-right">profit factor</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.rule} className="border-b border-border/60">
                    <td className="p-2">{s.rule}</td>
                    <td className="ltr-nums p-2">{formatFaNumber(s.count)}</td>
                    <td className="ltr-nums p-2">{formatFaPercent(s.winRate, 1)}</td>
                    <td className="ltr-nums p-2">{s.profitFactor == null ? "—" : formatFaNumber(s.profitFactor, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="rounded-lg border border-border bg-surface p-3">
        <h2 className="mb-2 text-sm font-bold">روند score → بازدهی (۵ روزه)</h2>
        {scorePoints.length === 0 ? (
          <EmptyState icon={LineChart} title="هنوز داده‌ای نیست" />
        ) : (
          <ReactECharts option={scatterOption} style={{ height: 280 }} />
        )}
      </div>
    </div>
  );
}
