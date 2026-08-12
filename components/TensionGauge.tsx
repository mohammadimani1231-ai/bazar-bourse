"use client";

import ReactECharts from "echarts-for-react";
import { formatFaNumber } from "@/lib/format.ts";
import { formatJalaliDateTime } from "@/lib/jalali.ts";
import { CHART_COLORS } from "@/lib/chartColors.ts";

export function TensionGauge({ value, capturedAt }: { value: number | null; capturedAt: string | null }) {
  if (value == null) {
    return (
      <div className="rounded-lg border border-border bg-surface shadow-card p-3">
        <h2 className="mb-2 text-sm font-bold">شاخص تنش</h2>
        <p className="text-xs text-muted">هنوز داده‌ای کافی برای محاسبه نیست.</p>
      </div>
    );
  }

  const option = {
    backgroundColor: "transparent",
    series: [
      {
        type: "gauge",
        min: 0,
        max: 100,
        startAngle: 200,
        endAngle: -20,
        axisLine: {
          lineStyle: {
            width: 14,
            color: [
              [0.35, CHART_COLORS.up],
              [0.65, CHART_COLORS.warning],
              [1, CHART_COLORS.down],
            ],
          },
        },
        pointer: { itemStyle: { color: CHART_COLORS.foreground } },
        axisTick: { show: false },
        splitNumber: 5,
        splitLine: { length: 10, lineStyle: { color: CHART_COLORS.foreground, width: 2 } },
        axisLabel: { color: CHART_COLORS.muted, fontSize: 10, distance: 22 },
        detail: {
          valueAnimation: true,
          formatter: (v: number) => formatFaNumber(v, 0),
          color: CHART_COLORS.foreground,
          fontSize: 22,
          fontWeight: "bold",
          offsetCenter: [0, "60%"],
        },
        data: [{ value }],
      },
    ],
  };

  return (
    <div className="rounded-lg border border-border bg-surface shadow-card p-3">
      <h2 className="mb-1 text-sm font-bold">شاخص تنش</h2>
      <ReactECharts option={option} style={{ height: 180 }} />
      {capturedAt && (
        <p className="ltr-nums text-center text-[11px] text-muted">آخرین محاسبه: {formatJalaliDateTime(capturedAt)}</p>
      )}
    </div>
  );
}
