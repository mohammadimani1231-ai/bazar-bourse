"use client";

import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { useRouter } from "next/navigation";
import { formatFaCompactRial, formatFaPercent } from "@/lib/format.ts";
import { getChartColors, hexToRgb } from "@/lib/chartColors.ts";
import { useTheme } from "@/components/ThemeProvider";

export interface TreemapItem {
  symbol: string;
  industry: string;
  tradeValue: number;
  moneyFlow: number | null;
  changePct: number | null;
}

type ColorMode = "money_flow" | "change_pct";

function makeMixColor(colors: ReturnType<typeof getChartColors>) {
  const UP = hexToRgb(colors.up);
  const DOWN = hexToRgb(colors.down);
  const NEUTRAL = hexToRgb(colors.neutral);
  // ratio در بازهٔ [-1,1]، منفی=قرمز، مثبت=سبز، صفر=خاکستری خنثی — چون این میان‌یابی RGB در
  // جاوااسکریپت انجام می‌شود (نه CSS)، به مقدار واقعی HEX تم فعلی نیاز دارد، نه رشتهٔ var().
  return function mixColor(ratio: number): string {
    const clamped = Math.max(-1, Math.min(1, ratio));
    const target = clamped >= 0 ? UP : DOWN;
    const t = Math.abs(clamped);
    const rgb = NEUTRAL.map((n, i) => Math.round(n + (target[i] - n) * t));
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  };
}

export function MarketTreemap({ items }: { items: TreemapItem[] }) {
  const [mode, setMode] = useState<ColorMode>("money_flow");
  const router = useRouter();
  const { theme } = useTheme();
  const colors = getChartColors(theme === "dark");
  const mixColor = useMemo(() => makeMixColor(colors), [theme]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxAbsMoneyFlow = useMemo(
    () => Math.max(1, ...items.map((i) => Math.abs(i.moneyFlow ?? 0))),
    [items],
  );

  // گروه‌بندی به‌تفکیک صنعت (الگوی Finviz — نه treemap تخت از همهٔ نمادها؛ هر صنعت یک خوشه
  // با لیبل خودش، رنگ فقط روی برگ‌های نماد اعمال می‌شود نه پس‌زمینهٔ خوشه).
  const option = useMemo(() => {
    const byIndustry = new Map<string, typeof items>();
    for (const item of items) {
      const list = byIndustry.get(item.industry) ?? [];
      list.push(item);
      byIndustry.set(item.industry, list);
    }

    const data = [...byIndustry.entries()].map(([industry, symbols]) => ({
      name: industry,
      itemStyle: { color: "var(--surface-2)" },
      children: symbols.map((item) => {
        const ratio = mode === "money_flow" ? (item.moneyFlow ?? 0) / maxAbsMoneyFlow : (item.changePct ?? 0) / 5; // ±۵٪ برای اشباع کامل رنگ
        const inlineMetric = mode === "money_flow" ? formatFaCompactRial(item.moneyFlow) : formatFaPercent(item.changePct);
        return {
          name: `${item.symbol}\n${inlineMetric}`,
          value: item.tradeValue,
          itemStyle: { color: mixColor(ratio) },
          symbol: item.symbol,
          industry: item.industry,
          moneyFlow: item.moneyFlow,
          changePct: item.changePct,
        };
      }),
    }));

    return {
      backgroundColor: "transparent",
      tooltip: {
        formatter: (p: { data: { symbol?: string; industry?: string; value?: number; moneyFlow?: number | null; changePct?: number | null } }) => {
          const d = p.data;
          if (!d.symbol) return "";
          const flowText =
            d.moneyFlow == null ? "—" : formatFaCompactRial(d.moneyFlow) + (d.moneyFlow >= 0 ? " ورودی" : " خروجی");
          return `<b>${d.symbol}</b> — ${d.industry}<br/>ارزش معاملات: ${formatFaCompactRial(d.value)}<br/>ورود پول حقیقی: ${flowText}<br/>تغییر قیمت: ${formatFaPercent(d.changePct)}`;
        },
      },
      series: [
        {
          type: "treemap",
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          leafDepth: 2,
          label: {
            color: "var(--foreground)",
            fontFamily: "var(--font-vazirmatn)",
            fontSize: 11,
            lineHeight: 15,
          },
          upperLabel: {
            show: true,
            height: 22,
            color: "var(--muted)",
            fontFamily: "var(--font-vazirmatn)",
            fontSize: 11,
            fontWeight: "bold" as const,
            // ECharts پیش‌فرضش برای upperLabel چپ‌چین است و به dir="rtl" صفحه کاری ندارد
            // (کاملاً svg-محور، مثل قید #۱۲ دربارهٔ چارت‌ها). align:"right" امتحان و زنده
            // تست شد ولی هیچ اثری نداشت — به‌نظر محدودیت واقعی خودِ upperLabel در این نسخهٔ
            // ECharts است (align:"left"/"center" هر دو کار می‌کنند، فقط "right" نه).
            // align:"center" جایگزین شد: برچسب دقیقاً وسط خوشهٔ خودش می‌نشیند و چون وسط‌چین
            // است، مستقل از جهت هم درست خوانده می‌شود — نیازی به دور زدن باگ نبود.
            align: "center" as const,
          },
          // borderRadius/gap بزرگ‌تر از پیش‌فرض ECharts — باکس‌های نرم‌تر با فاصلهٔ نفس‌کشیدن،
          // به‌جای بلوک‌های سخت چسبیده به‌هم که در بازخورد کاربر «مثل جدول» دیده می‌شد.
          itemStyle: { borderColor: "var(--border)", borderWidth: 2, gapWidth: 3, borderRadius: 4 },
          levels: [
            { itemStyle: { borderWidth: 0, gapWidth: 3, borderRadius: 6 } },
            { itemStyle: { borderColor: "var(--background)", borderWidth: 2, gapWidth: 2, borderRadius: 4 } },
          ],
          data,
        },
      ],
    };
  }, [items, mode, maxAbsMoneyFlow, mixColor]);

  return (
    <div className="rounded-lg border border-border bg-surface shadow-card p-3">
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
      <div className="mb-2 flex items-center gap-2 text-[11px] text-muted">
        <span>{mode === "money_flow" ? "بیشترین خروج" : "بیشترین افت"}</span>
        <div
          className="h-2 flex-1 rounded"
          style={{
            background: "linear-gradient(to right, var(--up), var(--surface-2), var(--down))",
          }}
        />
        <span>{mode === "money_flow" ? "بیشترین ورود" : "بیشترین رشد"}</span>
      </div>
      <ReactECharts
        option={option}
        style={{ height: 420 }}
        opts={{ renderer: "svg" }}
        onEvents={{
          click: (params: { data?: { symbol?: string } }) => {
            const symbol = params.data?.symbol;
            if (symbol) router.push(`/symbol/${encodeURIComponent(symbol)}`);
          },
        }}
      />
      <p className="mt-2 text-[11px] text-muted">
        اندازهٔ هر باکس = ارزش معاملات امروز (نه ارزش بازار/مارکت‌کپ — این داده در سیستم موجود نیست).
      </p>
    </div>
  );
}
