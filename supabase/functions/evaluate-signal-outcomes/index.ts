import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { fetchAllPages } from "../../../lib/supabase/fetchAllPages.ts";

const LOOKBACK_DAYS = 40;

interface CandleRow {
  date: string;
  open: number | null;
  close: number | null;
}

/**
 * شبانه: کارنامهٔ سیگنال‌های اخیر را پر می‌کند — ورود با open اولین روز معاملاتی بعد از
 * تاریخ سیگنال (نه close همان روز، طبق قید ضد look-ahead)، بازده ۱/۵/۲۰ روزه از آن نقطه.
 * سیگنال‌هایی که return_20d هنوز ندارند دوباره پردازش می‌شوند (idempotent).
 */
Deno.serve(async () => {
  const start = performance.now();
  const client = createServiceClient();

  try {
    const lookbackStart = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const recentSignals = await fetchAllPages(async (from, to) => {
      const { data, error } = await client
        .from("signals")
        .select("id, symbol, created_at")
        .gte("created_at", lookbackStart)
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return data ?? [];
    });

    const signalIds = (recentSignals ?? []).map((s) => s.id as number);
    const { data: existingOutcomes, error: outcomesError } = await client
      .from("signal_outcomes")
      .select("signal_id, return_20d")
      .in("signal_id", signalIds.length > 0 ? signalIds : [-1]);
    if (outcomesError) throw outcomesError;

    const completed = new Set(
      (existingOutcomes ?? []).filter((o) => o.return_20d != null).map((o) => o.signal_id as number),
    );
    const pending = (recentSignals ?? []).filter((s) => !completed.has(s.id as number));

    const candlesCache = new Map<string, CandleRow[]>();
    async function getCandles(symbol: string): Promise<CandleRow[]> {
      const cached = candlesCache.get(symbol);
      if (cached) return cached;
      const { data, error } = await client
        .from("daily_candles")
        .select("date, open, close")
        .eq("symbol", symbol)
        .order("date", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as CandleRow[];
      candlesCache.set(symbol, rows);
      return rows;
    }

    const results: {
      signal_id: number;
      return_1d: number | null;
      return_5d: number | null;
      return_20d: number | null;
      evaluated_at: string;
    }[] = [];

    for (const signal of pending) {
      const candles = await getCandles(signal.symbol as string);
      const signalDate = (signal.created_at as string).slice(0, 10);
      const entryIndex = candles.findIndex((c) => c.date > signalDate);
      if (entryIndex === -1) continue; // هنوز روز معاملاتی بعد از سیگنال نرسیده

      const entryPrice = candles[entryIndex].open;
      if (entryPrice == null) continue;

      const returnAt = (offset: number): number | null => {
        const row = candles[entryIndex + offset];
        if (!row || row.close == null) return null;
        return ((row.close - entryPrice) / entryPrice) * 100;
      };

      results.push({
        signal_id: signal.id as number,
        return_1d: returnAt(0),
        return_5d: returnAt(4),
        return_20d: returnAt(19),
        evaluated_at: new Date().toISOString(),
      });
    }

    if (results.length > 0) {
      const { error: upsertError } = await client
        .from("signal_outcomes")
        .upsert(results, { onConflict: "signal_id" });
      if (upsertError) throw upsertError;
    }

    const latencyMs = Math.round(performance.now() - start);
    await logHealth(client, "evaluate-signal-outcomes", "ok", `${results.length} outcomes updated`, latencyMs);

    return new Response(JSON.stringify({ ok: true, updated: results.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    await logHealth(client, "evaluate-signal-outcomes", "error", message, latencyMs);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
