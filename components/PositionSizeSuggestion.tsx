"use client";

import { useEffect, useState, useTransition } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browserClient.ts";
import { atr } from "@/lib/indicators.ts";
import { queueState } from "@/lib/tabloo.ts";
import { calculatePositionSize, suggestStopLossFromAtr } from "@/lib/position-sizing.ts";
import { openPaperTrade } from "@/app/actions/paperTrades.ts";
import { formatFaNumber } from "@/lib/format.ts";
import type { MarketRegime } from "@/lib/marketRegime.ts";

interface Suggestion {
  entryPrice: number;
  stopLossPrice: number;
  shareCount: number;
  capitalAtRisk: number;
  positionValue: number;
  warnings: string[];
}

/**
 * فقط برای سیگنال‌های خرید — جدول paper_trades طراحی long-only دارد (بدون ستون جهت).
 * حد ضرر پیشنهادی از ATR14×1.5 است (تصمیم مکتوب در CLAUDE.md فاز ۸، چون هیچ مفهوم حد ضرر
 * دیگری در سیستم نبود)؛ کاربر می‌تواند قبل از ثبت دستی جایگزینش کند.
 */
export function PositionSizeSuggestion({ symbol, signalId }: { symbol: string; signalId: number }) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [registered, setRegistered] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = getSupabaseBrowserClient();
      const [{ data: quote }, { data: candlesRaw }, { data: riskSettings }, { data: regimeSetting }] = await Promise.all([
        supabase
          .from("quotes")
          .select("last_price, bid1_price, ask1_price, price_max, price_min, captured_at")
          .eq("symbol", symbol)
          .order("captured_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("daily_candles").select("high, low, close").eq("symbol", symbol).order("date", { ascending: false }).limit(30),
        supabase
          .from("risk_settings")
          .select("total_capital, max_risk_per_trade_pct, max_single_position_pct, regime_risk_multiplier")
          .eq("id", 1)
          .maybeSingle(),
        supabase.from("settings").select("value").eq("key", "market_regime").maybeSingle(),
      ]);
      if (cancelled) return;

      if (!quote?.last_price) {
        setError("قیمت زندهٔ این نماد در دسترس نیست");
        setLoading(false);
        return;
      }
      if (!riskSettings?.total_capital) {
        setError("ابتدا سرمایه را در تنظیمات ریسک وارد کن");
        setLoading(false);
        return;
      }

      const candles = [...(candlesRaw ?? [])].reverse();
      const highs = candles.map((c) => c.high as number);
      const lows = candles.map((c) => c.low as number);
      const closes = candles.map((c) => c.close as number);
      const atrSeries = atr(highs, lows, closes, 14);
      const lastAtr = [...atrSeries].reverse().find((v) => v != null) ?? null;

      if (lastAtr == null) {
        setError("برای محاسبهٔ ATR دادهٔ تاریخی کافی نیست");
        setLoading(false);
        return;
      }

      const entryPrice = quote.last_price as number;
      const stopLossPrice = suggestStopLossFromAtr(entryPrice, lastAtr);
      const queue = queueState({
        bid1_price: quote.bid1_price,
        ask1_price: quote.ask1_price,
        price_max: quote.price_max,
        price_min: quote.price_min,
        bid1_volume: null,
        base_volume: null,
      });
      const regime = (regimeSetting?.value as MarketRegime | undefined) ?? "normal";

      const result = calculatePositionSize({
        capital: riskSettings.total_capital as number,
        riskPerTradePct: riskSettings.max_risk_per_trade_pct as number,
        entryPrice,
        stopLossPrice,
        regime,
        regimeMultiplier: riskSettings.regime_risk_multiplier as Record<string, number>,
        maxSinglePositionPct: riskSettings.max_single_position_pct as number,
        queueLocked: { buy: queue.lockedBuy, sell: queue.lockedSell },
      });

      setSuggestion({ entryPrice, stopLossPrice, ...result });
      setLoading(false);
    }
    load().catch(() => {
      if (!cancelled) {
        setError("محاسبهٔ اندازه پوزیشن ناموفق بود");
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const handleRegister = () => {
    if (!suggestion) return;
    setRegisterError(null);
    startTransition(async () => {
      try {
        await openPaperTrade({
          symbol,
          signalId,
          entryPrice: suggestion.entryPrice,
          stopLoss: suggestion.stopLossPrice,
          shareCount: suggestion.shareCount,
          notes: null,
        });
        setRegistered(true);
      } catch (err) {
        setRegisterError(err instanceof Error ? err.message : "ثبت معامله ناموفق بود");
      }
    });
  };

  if (loading) return <p className="text-[10px] text-muted">در حال محاسبهٔ اندازهٔ پوزیشن پیشنهادی...</p>;
  if (error) return <p className="text-[10px] text-muted">{error}</p>;
  if (!suggestion) return null;

  return (
    <div className="mt-2 rounded-md border border-border bg-surface shadow-card p-2">
      <p className="mb-1 text-[10px] font-bold text-foreground">اندازه پوزیشن پیشنهادی</p>
      <div className="ltr-nums flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">
        <span>ورود: {formatFaNumber(suggestion.entryPrice)}</span>
        <span>حد ضرر پیشنهادی (ATR): {formatFaNumber(suggestion.stopLossPrice)}</span>
        <span>تعداد سهم: {formatFaNumber(suggestion.shareCount)}</span>
        <span>ریسک: {formatFaNumber(suggestion.capitalAtRisk)}</span>
        <span>ارزش پوزیشن: {formatFaNumber(suggestion.positionValue)}</span>
      </div>
      {suggestion.warnings.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {suggestion.warnings.map((w, i) => (
            <li key={i} className="text-[10px] text-down">
              ⚠ {w}
            </li>
          ))}
        </ul>
      )}
      {suggestion.shareCount > 0 && (
        <div className="mt-2">
          {registered ? (
            <span className="text-[10px] text-up">به‌عنوان معاملهٔ کاغذی ثبت شد.</span>
          ) : (
            <button
              onClick={handleRegister}
              disabled={isPending}
              className="rounded-md bg-accent px-2 py-1 text-[10px] font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              ثبت به‌عنوان معاملهٔ کاغذی
            </button>
          )}
          {registerError && <p className="mt-1 text-[10px] text-down">{registerError}</p>}
        </div>
      )}
    </div>
  );
}
