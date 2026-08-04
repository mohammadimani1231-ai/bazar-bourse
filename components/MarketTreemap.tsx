"use client";

import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { useRouter } from "next/navigation";
import { formatFaCompactRial, formatFaPercent } from "@/lib/format.ts";

export interface TreemapItem {
  symbol: string;
  industry: string;
  tradeValue: number;
  moneyFlow: number | null;
  changePct: number | null;
}

type ColorMode = "money_flow" | "change_pct";

const UP = [34, 197, 94]; // rgb(--up)
const DOWN = [239, 68, 68]; // rgb(--down)
const NEUTRAL = [58, 58, 68];

function mixColor(ratio: number): string {
  // ratio در بازهٔ [-1,1]، منفی=قرمز، مثبت=سبز، صفر=خاکستری خنثی
  const clamped = Math.max(-1, Math.min(1, ratio));
  const target = clamped >= 0 ? UP : DOWN;
  const t = Math.abs(clamped);
  const rgb = NEUTRAL.map((n, i) => Math.round(n + (target[i] - n) * t));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

export function MarketTreemap({ items }: { items: TreemapItem[] }) {
  const [mode, setMode] = useState<ColorMode>("money_flow");
  const router = useRouter();

  const maxAbsMoneyFlow = useMemo(
    () => Math.max(1, ...items.map((i) => Math.abs(i.moneyFlow ?? 0))),
    [items],
  );

  const option = useMemo(() => {
    const data = items.map((item) => {
      const ratio =
        mode === "money_flow"
          ? (item.moneyFlow ?? 0) / maxAbsMoneyFlow
          : (item.changePct ?? 0) / 5; // ±۵٪ برای اشباع کامل رنگ
      return {
        name: item.symbol,
        value: item.tradeValue,
        itemStyle: { color: mixColor(ratio) },
        industry: item.industry,
        moneyFlow: item.moneyFlow,
        changePct: item.changePct,
      };
    });

    return {
      backgroundColor: "transparent",
      tooltip: {
        formatter: (p: { data: { name: string; industry: string; value: number; moneyFlow: number | null; changePct: number | null } }) => {
          const d = p.data;
          const flowText =
            d.moneyFlow == null ? "—" : formatFaCompactRial(d.moneyFlow) + (d.moneyFlow >= 0 ? " ورودی" : " خروجی");
          return `<b>${d.name}</b> — ${d.industry}<br/>ارزش معاملات: ${formatFaCompactRial(d.value)}<br/>ورود پول حقیقی: ${flowText}<br/>تغییر قیمت: ${formatFaPercent(d.changePct)}`;
        },
      },
      series: [
        {
          type: "treemap",
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          label: { color: "#fff", fontFamily: "var(--font-vazirmatn)", fontSize: 12 },
          upperLabel: { show: false },
          itemStyle: { borderColor: "var(--background)", borderWidth: 1, gapWidth: 1 },
          data,
        },
      ],
    };
  }, [items, mode, maxAbsMoneyFlow]);

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold">نقشهٔ بازار</h2>
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => setMode("money_flow")}
            className={`rounded px-2 py-1 ${mode === "money_flow" ? "bg-accent text-white" : "text-muted hover:bg-surface-2"}`}
          >
            ورود پول حقیقی
          </button>
          <button
            onClick={() => setMode("change_pct")}
            className={`rounded px-2 py-1 ${mode === "change_pct" ? "bg-accent text-white" : "text-muted hover:bg-surface-2"}`}
          >
            تغییر قیمت
          </button>
        </div>
      </div>
      <ReactECharts
        option={option}
        style={{ height: 420 }}
        onEvents={{
          click: (params: { name?: string }) => {
            if (params.name) router.push(`/symbol/${encodeURIComponent(params.name)}`);
          },
        }}
      />
      <p className="mt-2 text-[11px] text-muted">
        اندازهٔ هر باکس = ارزش معاملات امروز (نه ارزش بازار/مارکت‌کپ — این داده در سیستم موجود نیست).
      </p>
    </div>
  );
}
