"use client";

import ReactECharts from "echarts-for-react";
import { formatTehranTime } from "@/lib/jalali.ts";
import { formatFaCompactRial, formatFaNumber } from "@/lib/format.ts";

export interface IntradayPoint {
  capturedAt: string;
  perCapitaBuy: number | null;
  perCapitaSell: number | null;
  buyerPower: number | null;
  moneyFlow: number | null;
}

function baseOption(xAxisData: string[], yAxisFormatter: (v: number) => string) {
  return {
    backgroundColor: "transparent",
    grid: { left: 56, right: 16, top: 24, bottom: 28 },
    textStyle: { fontFamily: "var(--font-vazirmatn)" },
    xAxis: {
      type: "category",
      data: xAxisData,
      axisLine: { lineStyle: { color: "#2a2a33" } },
      axisLabel: { color: "#9a9aa5", fontSize: 10 },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      splitLine: { lineStyle: { color: "#2a2a33" } },
      axisLabel: { color: "#9a9aa5", fontSize: 10, formatter: yAxisFormatter },
    },
  };
}

export function IntradayFlowChart({ points }: { points: IntradayPoint[] }) {
  const sorted = [...points].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const xAxisData = sorted.map((p) => formatTehranTime(p.capturedAt));

  if (sorted.length === 0) {
    return <p className="text-xs text-muted">هنوز دیتای درون‌روزی امروز ثبت نشده.</p>;
  }

  const perCapitaOption = {
    ...baseOption(xAxisData, (v) => formatFaNumber(v)),
    tooltip: { trigger: "axis", valueFormatter: (v: number) => formatFaNumber(v) },
    legend: { data: ["سرانه خرید", "سرانه فروش"], textStyle: { color: "#9a9aa5" }, top: 0 },
    series: [
      {
        name: "سرانه خرید",
        type: "line",
        data: sorted.map((p) => p.perCapitaBuy),
        color: "#22c55e",
        showSymbol: false,
      },
      {
        name: "سرانه فروش",
        type: "line",
        data: sorted.map((p) => p.perCapitaSell),
        color: "#ef4444",
        showSymbol: false,
      },
    ],
  };

  const buyerPowerOption = {
    ...baseOption(xAxisData, (v) => formatFaNumber(v, 2)),
    tooltip: { trigger: "axis", valueFormatter: (v: number) => formatFaNumber(v, 2) },
    series: [
      {
        name: "قدرت خریدار",
        type: "line",
        data: sorted.map((p) => p.buyerPower),
        color: "#6366f1",
        showSymbol: false,
        markLine: {
          symbol: "none",
          silent: true,
          lineStyle: { color: "#9a9aa5", type: "dashed" },
          data: [{ yAxis: 1 }],
        },
      },
    ],
  };

  const moneyFlowOption = {
    ...baseOption(xAxisData, (v) => formatFaCompactRial(v)),
    tooltip: { trigger: "axis", valueFormatter: (v: number) => formatFaCompactRial(v) },
    series: [
      {
        name: "ورود پول تجمعی",
        type: "line",
        data: sorted.map((p) => p.moneyFlow),
        areaStyle: { opacity: 0.15 },
        color: "#6366f1",
        showSymbol: false,
      },
    ],
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-1 text-xs text-muted">سرانه خرید/فروش حقیقی</p>
        <ReactECharts option={perCapitaOption} style={{ height: 160 }} />
      </div>
      <div>
        <p className="mb-1 text-xs text-muted">قدرت خریدار (سرانه خرید ÷ سرانه فروش)</p>
        <ReactECharts option={buyerPowerOption} style={{ height: 140 }} />
      </div>
      <div>
        <p className="mb-1 text-xs text-muted">ورود پول تجمعی حقیقی</p>
        <ReactECharts option={moneyFlowOption} style={{ height: 140 }} />
      </div>
    </div>
  );
}
