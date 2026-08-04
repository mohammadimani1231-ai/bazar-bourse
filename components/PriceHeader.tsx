"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browserClient.ts";
import { formatFaNumber } from "@/lib/format.ts";
import { formatTehranTime } from "@/lib/jalali.ts";

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

export function PriceHeader({ symbol, initial }: { symbol: string; initial: QuoteSnapshot }) {
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

  return (
    <div className="flex flex-wrap items-end gap-6 rounded-lg border border-border bg-surface p-3">
      <div>
        <p className="text-xs text-muted">نماد</p>
        <p className="text-xl font-bold">{symbol}</p>
      </div>
      <div>
        <p className="text-xs text-muted">آخرین قیمت (pl)</p>
        <p className="ltr-nums text-lg font-bold">{formatFaNumber(snapshot.lastPrice)}</p>
      </div>
      <div>
        <p className="text-xs text-muted">قیمت پایانی (pc)</p>
        <p className="ltr-nums text-lg font-bold">{formatFaNumber(snapshot.closePrice)}</p>
      </div>
      {snapshot.capturedAt && (
        <div>
          <p className="text-xs text-muted">آخرین به‌روزرسانی</p>
          <p className="ltr-nums text-xs text-muted">{formatTehranTime(snapshot.capturedAt)}</p>
        </div>
      )}
    </div>
  );
}
