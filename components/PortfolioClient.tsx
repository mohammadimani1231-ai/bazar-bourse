"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Briefcase, PlusCircle } from "lucide-react";
import { openPaperTrade, closePaperTrade } from "@/app/actions/paperTrades.ts";
import { formatFaNumber, formatFaPercent } from "@/lib/format.ts";
import { EmptyState } from "@/components/EmptyState";
import { SymbolPicker, type SymbolOption } from "@/components/SymbolPicker";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { getSupabaseBrowserClient } from "@/lib/supabase/browserClient.ts";
import { atr } from "@/lib/indicators.ts";
import { getStopLossWarnings, suggestStopLossFromAtr } from "@/lib/position-sizing.ts";

export interface OpenPositionRow {
  id: number;
  symbol: string;
  industry: string;
  entryPrice: number;
  stopLoss: number | null;
  shareCount: number;
  entryDateFa: string;
  currentPrice: number | null;
  positionValue: number;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
  notes: string | null;
}

export interface ClosePositionRow {
  id: number;
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  shareCount: number;
  entryDateFa: string;
  exitDateFa: string;
  exitDate: string;
  realizedPnl: number;
  realizedPnlPct: number | null;
}

const inputClass = "w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs text-foreground ltr-nums";

function CloseTradeRow({ position }: { position: OpenPositionRow }) {
  const [exitPrice, setExitPrice] = useState(position.currentPrice ?? position.entryPrice);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleClose = () => {
    setError(null);
    startTransition(async () => {
      try {
        await closePaperTrade(position.id, exitPrice);
      } catch (err) {
        setError(err instanceof Error ? err.message : "بستن معامله ناموفق بود");
      }
    });
  };

  return (
    <div className="flex items-center gap-1">
      <FormattedNumberInput
        className={`${inputClass} w-24`}
        placeholder="ریال"
        value={exitPrice}
        onChange={(v) => setExitPrice(v === "" ? 0 : v)}
      />
      <button
        onClick={handleClose}
        disabled={isPending}
        className="rounded-md bg-surface-2 px-2 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
      >
        بستن
      </button>
      {error && <span className="text-[10px] text-down">{error}</span>}
    </div>
  );
}

function AddTradeForm({ onDone, symbolOptions }: { onDone: () => void; symbolOptions: SymbolOption[] }) {
  const [symbol, setSymbol] = useState("");
  const [entryPrice, setEntryPrice] = useState<number | "">("");
  const [stopLoss, setStopLoss] = useState<number | "">("");
  const [shareCount, setShareCount] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [atrHint, setAtrHint] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const entryPriceTouchedRef = useRef(false);
  const stopLossTouchedRef = useRef(false);

  useEffect(() => {
    entryPriceTouchedRef.current = false;
    stopLossTouchedRef.current = false;
    setAtrHint(null);
    if (!symbol) return;

    let cancelled = false;
    async function load() {
      const supabase = getSupabaseBrowserClient();
      const [{ data: quote }, { data: candlesRaw }] = await Promise.all([
        supabase.from("quotes").select("last_price").eq("symbol", symbol).order("captured_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("daily_candles").select("high, low, close").eq("symbol", symbol).order("date", { ascending: false }).limit(30),
      ]);
      if (cancelled || !quote?.last_price) return;

      const candles = [...(candlesRaw ?? [])].reverse();
      const highs = candles.map((c) => c.high as number);
      const lows = candles.map((c) => c.low as number);
      const closes = candles.map((c) => c.close as number);
      const atrSeries = atr(highs, lows, closes, 14);
      const lastAtr = [...atrSeries].reverse().find((v) => v != null) ?? null;
      if (lastAtr == null) return;

      const entryPriceCandidate = quote.last_price as number;
      const stopLossCandidate = suggestStopLossFromAtr(entryPriceCandidate, lastAtr);
      if (cancelled) return;

      if (!entryPriceTouchedRef.current) setEntryPrice(entryPriceCandidate);
      if (!stopLossTouchedRef.current) setStopLoss(stopLossCandidate);
      setAtrHint("پیشنهاد بر اساس ATR۱۴×۱٫۵ — قابل ویرایش");
    }
    load().catch(() => {
      /* پیشنهاد پیش‌فرض صرفاً کمکی است — شکست بی‌صدا، بدون خطا برای کاربر */
    });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const stopLossWarnings = entryPrice !== "" && stopLoss !== "" ? getStopLossWarnings(entryPrice, stopLoss) : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!symbol) {
      setError("نماد را از لیست انتخاب کن");
      return;
    }
    startTransition(async () => {
      try {
        await openPaperTrade({
          symbol,
          signalId: null,
          entryPrice: entryPrice === "" ? 0 : entryPrice,
          stopLoss: stopLoss === "" ? null : stopLoss,
          shareCount: shareCount === "" ? 0 : shareCount,
          notes: null,
        });
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "ثبت معامله ناموفق بود");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface-2/40 p-3">
      <div>
        <label className="mb-1 block text-[10px] text-muted">نماد</label>
        <SymbolPicker className={inputClass} options={symbolOptions} value={symbol} onChange={setSymbol} />
      </div>
      <div>
        <label className="mb-1 block text-[10px] text-muted">قیمت ورود (ریال)</label>
        <FormattedNumberInput
          className={inputClass}
          placeholder="۰"
          value={entryPrice}
          onChange={(v) => {
            entryPriceTouchedRef.current = true;
            setEntryPrice(v);
          }}
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] text-muted">حد ضرر — قیمت مطلق (ریال، اختیاری)</label>
        <FormattedNumberInput
          className={inputClass}
          placeholder="بدون حد ضرر"
          value={stopLoss}
          onChange={(v) => {
            stopLossTouchedRef.current = true;
            setStopLoss(v);
          }}
        />
        {atrHint && <p className="mt-0.5 text-[10px] text-muted">{atrHint}</p>}
      </div>
      <div>
        <label className="mb-1 block text-[10px] text-muted">تعداد سهم</label>
        <FormattedNumberInput className={inputClass} placeholder="۰" value={shareCount} onChange={setShareCount} />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
      >
        ثبت
      </button>
      {error && <span className="text-[10px] text-down">{error}</span>}
      {stopLossWarnings.length > 0 && (
        <ul className="flex w-full flex-col gap-0.5">
          {stopLossWarnings.map((w, i) => (
            <li key={i} className="text-[10px] text-down">
              ⚠ {w}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

export function PortfolioClient({
  openPositions,
  closedPositions,
  symbolOptions,
}: {
  openPositions: OpenPositionRow[];
  closedPositions: ClosePositionRow[];
  symbolOptions: SymbolOption[];
}) {
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-surface shadow-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold">پوزیشن‌های باز</h2>
          <button
            onClick={() => setShowAddForm((s) => !s)}
            className="flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
            ثبت معاملهٔ دستی
          </button>
        </div>
        {showAddForm && (
          <div className="mb-3">
            <AddTradeForm onDone={() => setShowAddForm(false)} symbolOptions={symbolOptions} />
          </div>
        )}
        {openPositions.length === 0 ? (
          <EmptyState icon={Briefcase} title="پوزیشن بازی ثبت نشده" description="از صفحهٔ سیگنال‌ها یا فرم بالا معامله ثبت کن." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="p-2 text-right">نماد</th>
                  <th className="p-2 text-right">ورود</th>
                  <th className="p-2 text-right">حد ضرر</th>
                  <th className="p-2 text-right">تعداد</th>
                  <th className="p-2 text-right">ارزش</th>
                  <th className="p-2 text-right">P&L واقع‌نشده</th>
                  <th className="p-2 text-right">بستن</th>
                </tr>
              </thead>
              <tbody>
                {openPositions.map((p) => (
                  <tr key={p.id} className="border-b border-border/60">
                    <td className="p-2">
                      <div className="font-bold">{p.symbol}</div>
                      <div className="text-[10px] text-muted">{p.industry} · {p.entryDateFa}</div>
                    </td>
                    <td className="ltr-nums p-2 text-right">{formatFaNumber(p.entryPrice)}</td>
                    <td className="ltr-nums p-2 text-right">{p.stopLoss == null ? "—" : formatFaNumber(p.stopLoss)}</td>
                    <td className="ltr-nums p-2 text-right">{formatFaNumber(p.shareCount)}</td>
                    <td className="ltr-nums p-2 text-right">{formatFaNumber(p.positionValue)}</td>
                    <td className={`ltr-nums p-2 text-right font-bold ${p.unrealizedPnl == null ? "text-muted" : p.unrealizedPnl >= 0 ? "text-up" : "text-down"}`}>
                      {p.unrealizedPnl == null ? "—" : `${formatFaNumber(p.unrealizedPnl)} (${formatFaPercent(p.unrealizedPnlPct)})`}
                    </td>
                    <td className="p-2">
                      <CloseTradeRow position={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface shadow-card p-3">
        <h2 className="mb-2 text-sm font-bold">معاملات بسته‌شده</h2>
        {closedPositions.length === 0 ? (
          <EmptyState icon={Briefcase} title="هنوز معامله‌ای بسته نشده" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="p-2 text-right">نماد</th>
                  <th className="p-2 text-right">ورود → خروج</th>
                  <th className="p-2 text-right">تاریخ</th>
                  <th className="p-2 text-right">P&L محقق‌شده</th>
                </tr>
              </thead>
              <tbody>
                {[...closedPositions].reverse().map((c) => (
                  <tr key={c.id} className="border-b border-border/60">
                    <td className="p-2 font-bold">{c.symbol}</td>
                    <td className="ltr-nums p-2 text-right">{formatFaNumber(c.entryPrice)} → {formatFaNumber(c.exitPrice)}</td>
                    <td className="ltr-nums p-2 text-right text-muted">{c.entryDateFa} → {c.exitDateFa}</td>
                    <td className={`ltr-nums p-2 text-right font-bold ${c.realizedPnl >= 0 ? "text-up" : "text-down"}`}>
                      {formatFaNumber(c.realizedPnl)} ({formatFaPercent(c.realizedPnlPct)})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
