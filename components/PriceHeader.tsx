"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browserClient.ts";
import { formatFaNumber, formatFaPercent } from "@/lib/format.ts";
import { formatTehranTime } from "@/lib/jalali.ts";
import { PriceFlash } from "@/components/PriceFlash";

export interface QuoteSnapshot {
  lastPrice: number | null;
  closePrice: number | null;
  capturedAt: string | null;
}

interface QuoteChangeRow {
  symbol: string;
  last_price: number | null;
  close_price: number | null;
  captured_at: string;
}

/**
 * چسبان به بالای صفحه هنگام اسکرول (الگوی Yahoo Finance: «قیمت همیشه جلوی چشم»).
 * طبق قید سخت پروژه (#۹ در CLAUDE.md) هر دو آخرین قیمت (pl) و قیمت پایانی (pc) همیشه
 * نمایش داده می‌شوند — pl به‌عنوان قیمت اصلی بزرگ با درصد تغییر، pc به‌عنوان آمار ثانویه.
 */
export function PriceHeader({
  symbol,
  industry,
  initial,
  previousClose,
}: {
  symbol: string;
  industry: string | null;
  initial: QuoteSnapshot;
  previousClose: number | null;
}) {
  const [snapshot, setSnapshot] = useState(initial);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`quotes-${symbol}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "quotes", filter: `symbol=eq.${symbol}` },
        (payload) => {
          const row = payload.new as QuoteChangeRow;
          setSnapshot({ lastPrice: row.last_price, closePrice: row.close_price, capturedAt: row.captured_at });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [symbol]);

  const changePct =
    previousClose != null && previousClose !== 0 && snapshot.lastPrice != null
      ? ((snapshot.lastPrice - previousClose) / previousClose) * 100
      : null;

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-end justify-between gap-4 border-b border-border bg-surface p-3">
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <p className="text-xl font-bold">{symbol}</p>
          {industry && <p className="text-xs text-muted">{industry}</p>}
        </div>
        <div>
          <p className="text-xs text-muted">آخرین قیمت (pl)</p>
          <div className="flex items-baseline gap-2">
            <PriceFlash value={snapshot.lastPrice}>
              <p className="ltr-nums px-1 text-2xl font-bold">{formatFaNumber(snapshot.lastPrice)}</p>
            </PriceFlash>
            {changePct != null && (
              <span className={`ltr-nums text-sm font-bold ${changePct >= 0 ? "text-up" : "text-down"}`}>
                {formatFaPercent(changePct)}
              </span>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted">قیمت پایانی (pc)</p>
          <p className="ltr-nums text-sm font-bold text-muted">{formatFaNumber(snapshot.closePrice)}</p>
        </div>
      </div>
      {snapshot.capturedAt && (
        <p className="ltr-nums text-xs text-muted">آخرین به‌روزرسانی: {formatTehranTime(snapshot.capturedAt)}</p>
      )}
    </div>
  );
}
