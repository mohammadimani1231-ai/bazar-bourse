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
      axisLine: { lineStyle: { color: "var(--border)" } },
      axisLabel: { color: "var(--muted)", fontFamily: "var(--font-jetbrains-mono)", fontSize: 10 },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      splitLine: { lineStyle: { color: "var(--border)" } },
      axisLabel: { color: "var(--muted)", fontFamily: "var(--font-jetbrains-mono)", fontSize: 10, formatter: yAxisFormatter },
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
    legend: { data: ["سرانه خرید", "سرانه فروش"], textStyle: { color: "var(--muted)" }, top: 0 },
    series: [
      {
        name: "سرانه خرید",
        type: "line",
        data: sorted.map((p) => p.perCapitaBuy),
        color: "var(--up)",
        showSymbol: false,
      },
      {
        name: "سرانه فروش",
        type: "line",
        data: sorted.map((p) => p.perCapitaSell),
        color: "var(--down)",
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
        color: "var(--accent)",
        showSymbol: false,
        markLine: {
          symbol: "none",
          silent: true,
          lineStyle: { color: "var(--muted)", type: "dashed" },
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
        color: "var(--accent)",
        showSymbol: false,
      },
    ],
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-1 text-xs text-muted">سرانه خرید/فروش حقیقی</p>
        <ReactECharts option={perCapitaOption} opts={{ renderer: "svg" }} style={{ height: 160 }} />
      </div>
      <div>
        <p className="mb-1 text-xs text-muted">قدرت خریدار (سرانه خرید ÷ سرانه فروش)</p>
        <ReactECharts option={buyerPowerOption} opts={{ renderer: "svg" }} style={{ height: 140 }} />
      </div>
      <div>
        <p className="mb-1 text-xs text-muted">ورود پول تجمعی حقیقی</p>
        <ReactECharts option={moneyFlowOption} opts={{ renderer: "svg" }} style={{ height: 140 }} />
      </div>
    </div>
  );
}
