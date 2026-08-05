"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  applyScreenerFilters,
  DEFAULT_SCREENER_FILTERS,
  type ScreenerFilters,
  type ScreenerRow,
} from "@/lib/screenerFilters.ts";
import { formatFaCompactRial, formatFaNumber } from "@/lib/format.ts";
import { toCsv } from "@/lib/csv.ts";
import { RangeSliderFilter } from "@/components/RangeSliderFilter";
import { ExportCsvButton } from "@/components/ExportCsvButton";
import { savePreset, addToWatchlist } from "@/app/screener/actions.ts";

export interface PresetRow {
  id: number;
  name: string;
  filters: ScreenerFilters;
}

export interface FilterBounds {
  tradeValue: [number, number];
  rsi: [number, number];
  compositeRank: [number, number];
  maDistance: [number, number];
  buyerPower: [number, number];
  moneyFlow: [number, number];
}

type Tab = "descriptive" | "technical" | "tabloo";

export function ScreenerClient({
  rows,
  industries,
  bounds,
  presets,
}: {
  rows: ScreenerRow[];
  industries: string[];
  bounds: FilterBounds;
  presets: PresetRow[];
}) {
  const [tab, setTab] = useState<Tab>("descriptive");
  const [filters, setFilters] = useState<ScreenerFilters>(DEFAULT_SCREENER_FILTERS);
  const [presetName, setPresetName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [addedSymbols, setAddedSymbols] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    return applyScreenerFilters(rows, filters).sort(
      (a, b) => (b.compositeRank ?? -1) - (a.compositeRank ?? -1),
    );
  }, [rows, filters]);

  const toggleIndustry = (industry: string) => {
    setFilters((f) => ({
      ...f,
      industries: f.industries.includes(industry)
        ? f.industries.filter((i) => i !== industry)
        : [...f.industries, industry],
    }));
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    startTransition(async () => {
      await savePreset(presetName.trim(), filters);
      setPresetName("");
    });
  };

  const handleLoadPreset = (preset: PresetRow) => {
    setFilters(preset.filters);
  };

  const handleAddToWatchlist = (row: ScreenerRow) => {
    startTransition(async () => {
      await addToWatchlist(row.symbol, row.industry);
      setAddedSymbols((s) => new Set(s).add(row.symbol));
    });
  };

  const csv = () =>
    toCsv(filtered, [
      { header: "نماد", accessor: (r) => r.symbol },
      { header: "نام شرکت", accessor: (r) => r.companyName ?? "" },
      { header: "صنعت", accessor: (r) => r.industry },
      { header: "ارزش معاملات", accessor: (r) => r.tradeValue },
      { header: "RSI14", accessor: (r) => r.rsi14 },
      { header: "رتبه مرکب", accessor: (r) => r.compositeRank },
      { header: "فاصله از MA50", accessor: (r) => r.maDistancePct },
      { header: "قدرت خریدار", accessor: (r) => r.buyerPower },
      { header: "ورود پول", accessor: (r) => r.moneyFlow },
    ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-surface p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex gap-1 text-sm">
            {(
              [
                ["descriptive", "توصیفی"],
                ["technical", "تکنیکال"],
                ["tabloo", "تابلوخوانی"],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-md px-3 py-1.5 ${tab === key ? "bg-accent text-white" : "text-muted hover:bg-surface-2"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mr-auto flex items-center gap-2">
            <select
              className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
              onChange={(e) => {
                const preset = presets.find((p) => String(p.id) === e.target.value);
                if (preset) handleLoadPreset(preset);
              }}
              defaultValue=""
            >
              <option value="" disabled>
                بارگذاری preset…
              </option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="نام preset"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              className="w-28 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
            />
            <button
              onClick={handleSavePreset}
              disabled={isPending || !presetName.trim()}
              className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:bg-surface-2 disabled:opacity-40"
            >
              ذخیره preset
            </button>
          </div>
        </div>

        {tab === "descriptive" && (
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1 text-xs text-muted">صنعت</p>
              <div className="flex flex-wrap gap-1">
                {industries.map((industry) => (
                  <button
                    key={industry}
                    onClick={() => toggleIndustry(industry)}
                    className={`rounded-full px-2 py-1 text-xs ${
                      filters.industries.includes(industry)
                        ? "bg-accent text-white"
                        : "bg-surface-2 text-muted hover:text-foreground"
                    }`}
                  >
                    {industry}
                  </button>
                ))}
              </div>
            </div>
            <RangeSliderFilter
              label="ارزش معاملات (امروز)"
              bounds={bounds.tradeValue}
              step={Math.max(1, Math.round((bounds.tradeValue[1] - bounds.tradeValue[0]) / 100))}
              value={filters.tradeValue}
              onChange={(v) => setFilters((f) => ({ ...f, tradeValue: v }))}
            />
          </div>
        )}

        {tab === "technical" && (
          <div className="flex flex-col gap-3">
            <RangeSliderFilter
              label="RSI14"
              bounds={[0, 100]}
              value={filters.rsi}
              onChange={(v) => setFilters((f) => ({ ...f, rsi: v }))}
            />
            <RangeSliderFilter
              label="رتبهٔ مرکب (پرسنتایل)"
              bounds={bounds.compositeRank}
              value={filters.compositeRank}
              onChange={(v) => setFilters((f) => ({ ...f, compositeRank: v }))}
            />
            <RangeSliderFilter
              label="فاصله از میانگین متحرک ۵۰ روزه (٪)"
              bounds={bounds.maDistance}
              step={0.5}
              value={filters.maDistance}
              onChange={(v) => setFilters((f) => ({ ...f, maDistance: v }))}
            />
          </div>
        )}

        {tab === "tabloo" && (
          <div className="flex flex-col gap-3">
            <RangeSliderFilter
              label="قدرت خریدار"
              bounds={bounds.buyerPower}
              step={0.1}
              value={filters.buyerPower}
              onChange={(v) => setFilters((f) => ({ ...f, buyerPower: v }))}
            />
            <RangeSliderFilter
              label="ورود پول حقیقی"
              bounds={bounds.moneyFlow}
              step={Math.max(1, Math.round((bounds.moneyFlow[1] - bounds.moneyFlow[0]) / 100))}
              value={filters.moneyFlow}
              onChange={(v) => setFilters((f) => ({ ...f, moneyFlow: v }))}
            />
            <div>
              <p className="mb-1 text-xs text-muted">حجم مشکوک</p>
              <select
                value={filters.suspiciousVolume}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, suspiciousVolume: e.target.value as ScreenerFilters["suspiciousVolume"] }))
                }
                className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
              >
                <option value="any">همه</option>
                <option value="only">فقط مشکوک</option>
                <option value="exclude">بدون مشکوک</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold">نتایج ({formatFaNumber(filtered.length)})</h2>
          <ExportCsvButton getCsv={csv} filename="screener.csv" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="p-2 text-right">نماد</th>
                <th className="p-2 text-right">نام شرکت</th>
                <th className="p-2 text-right">صنعت</th>
                <th className="p-2 text-right">رتبه مرکب</th>
                <th className="p-2 text-right">RSI14</th>
                <th className="p-2 text-right">ارزش معاملات</th>
                <th className="p-2 text-right">قدرت خریدار</th>
                <th className="p-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.symbol} className="border-b border-border/60 hover:bg-surface-2">
                  <td className="p-2">
                    <Link href={`/symbol/${encodeURIComponent(row.symbol)}`} className="text-accent hover:underline">
                      {row.symbol}
                    </Link>
                  </td>
                  <td className="p-2 text-muted">{row.companyName ?? "—"}</td>
                  <td className="p-2 text-muted">{row.industry}</td>
                  <td className="ltr-nums p-2 text-right">{formatFaNumber(row.compositeRank)}</td>
                  <td className="ltr-nums p-2 text-right">{formatFaNumber(row.rsi14)}</td>
                  <td className="ltr-nums p-2 text-right">{formatFaCompactRial(row.tradeValue)}</td>
                  <td className="ltr-nums p-2 text-right">{formatFaNumber(row.buyerPower, 2)}</td>
                  <td className="p-2">
                    <button
                      onClick={() => handleAddToWatchlist(row)}
                      disabled={isPending || addedSymbols.has(row.symbol)}
                      className="rounded border border-border px-2 py-0.5 text-muted hover:bg-surface-2 disabled:opacity-40"
                    >
                      {addedSymbols.has(row.symbol) ? "✓ در واچ‌لیست" : "افزودن به واچ‌لیست"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="p-4 text-center text-muted">نتیجه‌ای با این فیلترها نیست.</p>}
        </div>
      </div>
    </div>
  );
}
