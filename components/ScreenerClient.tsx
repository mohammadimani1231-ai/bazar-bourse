"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { SearchX, TriangleAlert } from "lucide-react";
import {
  applyScreenerFilters,
  DEFAULT_SCREENER_FILTERS,
  type ScreenerFilters,
  type ScreenerRow,
} from "@/lib/screenerFilters.ts";
import { formatFaCompactRial, formatFaNumber, formatFaPercent } from "@/lib/format.ts";
import { toCsv } from "@/lib/csv.ts";
import { FilterDropdown, type FilterDropdownOption } from "@/components/FilterDropdown";
import { ExportCsvButton } from "@/components/ExportCsvButton";
import { EmptyState } from "@/components/EmptyState";
import { Sparkline } from "@/components/Sparkline";
import { savePreset, addToWatchlist } from "@/app/screener/actions.ts";

const ALL: FilterDropdownOption = { label: "همه", range: { min: null, max: null } };

const TRADE_VALUE_OPTIONS: FilterDropdownOption[] = [
  ALL,
  { label: "زیر ۱ میلیارد", range: { min: null, max: 1_000_000_000 } },
  { label: "۱ تا ۱۰ میلیارد", range: { min: 1_000_000_000, max: 10_000_000_000 } },
  { label: "۱۰ تا ۱۰۰ میلیارد", range: { min: 10_000_000_000, max: 100_000_000_000 } },
  { label: "بالای ۱۰۰ میلیارد", range: { min: 100_000_000_000, max: null } },
];

const RSI_OPTIONS: FilterDropdownOption[] = [
  ALL,
  { label: "اشباع فروش (زیر ۳۰)", range: { min: null, max: 30 } },
  { label: "خنثی (۳۰ تا ۷۰)", range: { min: 30, max: 70 } },
  { label: "اشباع خرید (بالای ۷۰)", range: { min: 70, max: null } },
];

const COMPOSITE_RANK_OPTIONS: FilterDropdownOption[] = [
  ALL,
  { label: "ضعیف (زیر ۳۳)", range: { min: null, max: 33 } },
  { label: "متوسط (۳۳ تا ۶۶)", range: { min: 33, max: 66 } },
  { label: "قوی (بالای ۶۶)", range: { min: 66, max: null } },
];

const MA_DISTANCE_OPTIONS: FilterDropdownOption[] = [
  ALL,
  { label: "زیر خط (منفی)", range: { min: null, max: 0 } },
  { label: "نزدیک خط (±۲٪)", range: { min: -2, max: 2 } },
  { label: "بالای خط (مثبت)", range: { min: 0, max: null } },
];

const BUYER_POWER_OPTIONS: FilterDropdownOption[] = [
  ALL,
  { label: "ضعیف (زیر ۱)", range: { min: null, max: 1 } },
  { label: "متوسط (۱ تا ۲)", range: { min: 1, max: 2 } },
  { label: "قوی (بالای ۲)", range: { min: 2, max: null } },
];

const MONEY_FLOW_OPTIONS: FilterDropdownOption[] = [
  ALL,
  { label: "خروج پول (منفی)", range: { min: null, max: 0 } },
  { label: "ورود پول (مثبت)", range: { min: 0, max: null } },
  { label: "ورود قوی (بالای ۱ میلیارد)", range: { min: 1_000_000_000, max: null } },
];

export interface PresetRow {
  id: number;
  name: string;
  filters: ScreenerFilters;
}

type Tab = "descriptive" | "technical" | "tabloo";

const TAB_FILTER_COUNTS: Record<Tab, (f: ScreenerFilters) => number> = {
  descriptive: (f) => (f.industries.length > 0 ? 1 : 0) + (f.tradeValue.min != null || f.tradeValue.max != null ? 1 : 0),
  technical: (f) =>
    (f.rsi.min != null || f.rsi.max != null ? 1 : 0) +
    (f.compositeRank.min != null || f.compositeRank.max != null ? 1 : 0) +
    (f.maDistance.min != null || f.maDistance.max != null ? 1 : 0),
  tabloo: (f) =>
    (f.buyerPower.min != null || f.buyerPower.max != null ? 1 : 0) +
    (f.moneyFlow.min != null || f.moneyFlow.max != null ? 1 : 0) +
    (f.suspiciousVolume !== "any" ? 1 : 0),
};

export function ScreenerClient({
  rows,
  industries,
  presets,
}: {
  rows: ScreenerRow[];
  industries: string[];
  presets: PresetRow[];
}) {
  const [tab, setTab] = useState<Tab>("descriptive");
  const [filters, setFilters] = useState<ScreenerFilters>(DEFAULT_SCREENER_FILTERS);
  const [presetName, setPresetName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [addedSymbols, setAddedSymbols] = useState<Set<string>>(new Set());
  const [presetError, setPresetError] = useState<string | null>(null);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);

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
    setPresetError(null);
    startTransition(async () => {
      try {
        await savePreset(presetName.trim(), filters);
        setPresetName("");
      } catch (err) {
        setPresetError(err instanceof Error ? err.message : "ذخیرهٔ preset ناموفق بود");
      }
    });
  };

  const handleLoadPreset = (preset: PresetRow) => {
    setFilters(preset.filters);
  };

  const handleAddToWatchlist = (row: ScreenerRow) => {
    setWatchlistError(null);
    startTransition(async () => {
      try {
        await addToWatchlist(row.symbol, row.industry);
        setAddedSymbols((s) => new Set(s).add(row.symbol));
      } catch (err) {
        setWatchlistError(
          `افزودن ${row.symbol} ناموفق بود: ${err instanceof Error ? err.message : "خطای نامشخص"}`,
        );
      }
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
      { header: "فاصله تا سقف ۳ماهه", accessor: (r) => r.distanceFromHigh3mPct },
      { header: "فاصله تا سقف سالانه", accessor: (r) => r.distanceFromHigh1yPct },
      { header: "قدرت خریدار", accessor: (r) => r.buyerPower },
      { header: "ورود پول", accessor: (r) => r.moneyFlow },
    ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-surface shadow-card p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex gap-1 text-sm">
            {(
              [
                ["descriptive", "توصیفی"],
                ["technical", "تکنیکال"],
                ["tabloo", "تابلوخوانی"],
              ] as [Tab, string][]
            ).map(([key, label]) => {
              const count = TAB_FILTER_COUNTS[key](filters);
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${tab === key ? "bg-accent text-white" : "text-muted hover:bg-surface-2"}`}
                >
                  {label}
                  {count > 0 && (
                    <span
                      className={`ltr-nums rounded-full px-1.5 text-[10px] ${tab === key ? "bg-white/25" : "bg-accent/20 text-accent"}`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mr-auto flex items-center gap-2">
            <select
              className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs transition-colors hover:border-accent/50 focus:border-accent focus:outline-none"
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
              className="w-28 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs transition-colors hover:border-accent/50 focus:border-accent focus:outline-none"
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
        {presetError && <p className="mb-3 text-xs text-down">خطا: {presetError}</p>}

        {tab === "descriptive" && (
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1 text-[11px] text-muted">صنعت</p>
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
            <div className="flex flex-wrap gap-3">
              <FilterDropdown
                label="ارزش معاملات (امروز)"
                options={TRADE_VALUE_OPTIONS}
                value={filters.tradeValue}
                onChange={(v) => setFilters((f) => ({ ...f, tradeValue: v }))}
              />
            </div>
          </div>
        )}

        {tab === "technical" && (
          <div className="flex flex-wrap gap-3">
            <FilterDropdown label="RSI14" options={RSI_OPTIONS} value={filters.rsi} onChange={(v) => setFilters((f) => ({ ...f, rsi: v }))} />
            <FilterDropdown
              label="رتبهٔ مرکب (پرسنتایل)"
              options={COMPOSITE_RANK_OPTIONS}
              value={filters.compositeRank}
              onChange={(v) => setFilters((f) => ({ ...f, compositeRank: v }))}
            />
            <FilterDropdown
              label="فاصله از میانگین متحرک ۵۰ روزه"
              options={MA_DISTANCE_OPTIONS}
              value={filters.maDistance}
              onChange={(v) => setFilters((f) => ({ ...f, maDistance: v }))}
            />
          </div>
        )}

        {tab === "tabloo" && (
          <div className="flex flex-wrap gap-3">
            <FilterDropdown
              label="قدرت خریدار"
              options={BUYER_POWER_OPTIONS}
              value={filters.buyerPower}
              onChange={(v) => setFilters((f) => ({ ...f, buyerPower: v }))}
            />
            <FilterDropdown
              label="ورود پول حقیقی"
              options={MONEY_FLOW_OPTIONS}
              value={filters.moneyFlow}
              onChange={(v) => setFilters((f) => ({ ...f, moneyFlow: v }))}
            />
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted">حجم مشکوک</span>
              <select
                value={filters.suspiciousVolume}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, suspiciousVolume: e.target.value as ScreenerFilters["suspiciousVolume"] }))
                }
                className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs text-foreground transition-colors hover:border-accent/50 focus:border-accent focus:outline-none"
              >
                <option value="any">همه</option>
                <option value="only">فقط مشکوک</option>
                <option value="exclude">بدون مشکوک</option>
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface shadow-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold">نتایج ({formatFaNumber(filtered.length)})</h2>
          <ExportCsvButton getCsv={csv} filename="screener.csv" />
        </div>
        {watchlistError && <p className="mb-2 text-xs text-down">خطا: {watchlistError}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="p-2 text-right">نماد</th>
                <th className="p-2 text-right">روند</th>
                <th className="p-2 text-right">صنعت</th>
                <th className="p-2 text-right">رتبه مرکب</th>
                <th className="p-2 text-right">RSI14</th>
                <th className="p-2 text-right">ارزش معاملات</th>
                <th className="p-2 text-right">قدرت خریدار</th>
                <th className="p-2 text-right">فاصله تا سقف ۳ماهه</th>
                <th className="p-2 text-right">فاصله تا سقف سالانه</th>
                <th className="p-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => {
                // رتبهٔ مرکب خودش پرسنتایلی است (۰-۱۰۰، قید #۴) — «برتر» یعنی دهک بالای همان
                // توزیع، نه عدد ثابت دلخواه. لهجهٔ گرم فقط اینجا، برای اینکه معنا داشته باشد.
                const isTopRank = row.compositeRank != null && row.compositeRank >= 90;
                return (
                  <tr
                    key={row.symbol}
                    className={`border-b border-border/60 hover:bg-surface-2 ${i % 2 === 1 ? "bg-surface-2/25" : ""} ${
                      isTopRank ? "border-r-2 border-r-warning" : ""
                    }`}
                  >
                    <td className="p-2">
                      <Link href={`/symbol/${encodeURIComponent(row.symbol)}`} className="text-accent hover:underline">
                        {row.symbol}
                      </Link>
                      {row.companyName && <p className="text-[11px] text-muted">{row.companyName}</p>}
                    </td>
                    <td className="p-2">
                      <Sparkline values={row.recentCloses ?? []} width={64} height={22} />
                    </td>
                    <td className="p-2 text-muted">{row.industry}</td>
                    <td className={`ltr-nums p-2 text-right ${isTopRank ? "font-bold text-warning" : ""}`}>
                      {formatFaNumber(row.compositeRank)}
                    </td>
                    <td className="ltr-nums p-2 text-right">{formatFaNumber(row.rsi14)}</td>
                    <td className="ltr-nums p-2 text-right">{formatFaCompactRial(row.tradeValue)}</td>
                    <td className="ltr-nums p-2 text-right">{formatFaNumber(row.buyerPower, 2)}</td>
                    <td
                      className={`ltr-nums p-2 text-right ${
                        row.distanceFromHigh3mGap
                          ? "text-warning"
                          : row.distanceFromHigh3mPct != null && row.distanceFromHigh3mPct >= 0
                            ? "font-bold text-up-text"
                            : "text-muted"
                      }`}
                    >
                      {row.distanceFromHigh3mGap ? (
                        <span
                          className="inline-flex items-center gap-1"
                          title="توقف نماد/افزایش سرمایهٔ احتمالی در این بازه — سقف قابل‌اتکا نیست"
                        >
                          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          توقف/جهش
                        </span>
                      ) : row.distanceFromHigh3mPct == null ? (
                        "—"
                      ) : (
                        formatFaPercent(row.distanceFromHigh3mPct)
                      )}
                    </td>
                    <td
                      className={`ltr-nums p-2 text-right ${
                        row.distanceFromHigh1yGap
                          ? "text-warning"
                          : row.distanceFromHigh1yPct != null && row.distanceFromHigh1yPct >= 0
                            ? "font-bold text-up-text"
                            : "text-muted"
                      }`}
                    >
                      {row.distanceFromHigh1yGap ? (
                        <span
                          className="inline-flex items-center gap-1"
                          title="توقف نماد/افزایش سرمایهٔ احتمالی در این بازه — سقف قابل‌اتکا نیست"
                        >
                          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          توقف/جهش
                        </span>
                      ) : row.distanceFromHigh1yPct == null ? (
                        "—"
                      ) : (
                        formatFaPercent(row.distanceFromHigh1yPct)
                      )}
                    </td>
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
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState icon={SearchX} title="نتیجه‌ای با این فیلترها نیست" />}
        </div>
      </div>
    </div>
  );
}
