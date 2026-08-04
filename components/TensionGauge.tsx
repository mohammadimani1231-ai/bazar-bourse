"use client";

import ReactECharts from "echarts-for-react";
import { formatFaNumber } from "@/lib/format.ts";
import { formatJalaliDateTime } from "@/lib/jalali.ts";

export function TensionGauge({ value, capturedAt }: { value: number | null; capturedAt: string | null }) {
  if (value == null) {
    return (
      <div className="rounded-lg border border-border bg-surface p-3">
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
              [0.35, "#22c55e"],
              [0.65, "#eab308"],
              [1, "#ef4444"],
            ],
          },
        },
        pointer: { itemStyle: { color: "#e8e8ec" } },
        axisTick: { show: false },
        splitLine: { length: 10, lineStyle: { color: "#e8e8ec", width: 2 } },
        axisLabel: { color: "#9a9aa5", fontSize: 10, distance: 18 },
        detail: {
          valueAnimation: true,
          formatter: (v: number) => formatFaNumber(v, 0),
          color: "#e8e8ec",
          fontSize: 22,
          fontWeight: "bold",
          offsetCenter: [0, "60%"],
        },
        data: [{ value }],
      },
    ],
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <h2 className="mb-1 text-sm font-bold">شاخص تنش</h2>
      <ReactECharts option={option} style={{ height: 180 }} />
      {capturedAt && (
        <p className="ltr-nums text-center text-[11px] text-muted">آخرین محاسبه: {formatJalaliDateTime(capturedAt)}</p>
      )}
    </div>
  );
}
