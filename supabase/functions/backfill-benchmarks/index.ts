import { toGregorian, toJalaali } from "npm:jalaali-js@1";
import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { fetchWithRetry } from "../../../lib/data-sources/http.ts";

const GOLD_CURRENCY_PRO_URL = "https://Api.BrsApi.ir/Market/Gold_Currency_Pro.php";
const YEARS_OF_HISTORY = 5;

interface HistoryDailyEntry {
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

function jalaliToGregorian(jalaliDate: string): string | null {
  const parts = jalaliDate.replaceAll("/", "-").split("-").map(Number);
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return null;
  const [jy, jm, jd] = parts;
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

/**
 * یک‌بارمصرف (idempotent): دلار آزاد و طلای ۱۸ عیار را از BrsApi Gold_Currency_Pro
 * (history=2) در benchmark_candles ذخیره می‌کند — معادل بخش BrsApi اسکریپت
 * scripts/backfill_benchmarks.py، فقط چون آن endpoint هم مثل Tsetmc/History.php از IP
 * بعضی محیط‌های ابری ریست می‌شود، این نسخه از IP خود Supabase اجرا می‌شود.
 * شاخص کل (tedpix) را همان اسکریپت پایتون (از pytse-client) پر می‌کند، اینجا لازم نیست.
 */
Deno.serve(async () => {
  const start = performance.now();
  const client = createServiceClient();
  const brsApiKey = Deno.env.get("BRSAPI_KEY") ?? "";

  try {
    const cutoffDate = new Date(Date.now() - YEARS_OF_HISTORY * 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const now = new Date();
    const jToday = toJalaali(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
    const jalaliDateEnd = `${jToday.jy}-${String(jToday.jm).padStart(2, "0")}-${String(jToday.jd).padStart(2, "0")}`;

    const assets: { asset: string; section: string; symbol: string }[] = [
      { asset: "usd_irr", section: "currency", symbol: "USD" },
      { asset: "gold_18k", section: "gold", symbol: "IR_GOLD_18K" },
    ];

    const results: Record<string, number> = {};

    for (const { asset, section, symbol } of assets) {
      const url =
        `${GOLD_CURRENCY_PRO_URL}?key=${encodeURIComponent(brsApiKey)}&section=${section}` +
        `&history=2&symbol=${symbol}&date_start=1400-01-01&date_end=${jalaliDateEnd}`;
      const res = await fetchWithRetry(url, {}, { timeoutMs: 30000, retries: 2 });
      const data = (await res.json()) as { history_daily?: HistoryDailyEntry[] };
      const entries = data.history_daily ?? [];

      const rows = entries
        .map((e) => {
          const date = jalaliToGregorian(e.date);
          if (!date || date < cutoffDate) return null;
          return { asset, date, open: e.open ?? null, high: e.high ?? null, low: e.low ?? null, close: e.close ?? null };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length > 0) {
        const { error: upsertError } = await client
          .from("benchmark_candles")
          .upsert(rows, { onConflict: "asset,date" });
        if (upsertError) throw upsertError;
      }
      results[asset] = rows.length;
    }

    const latencyMs = Math.round(performance.now() - start);
    const total = Object.values(results).reduce((a, b) => a + b, 0);
    await logHealth(client, "backfill-benchmarks", "ok", `${total} rows`, latencyMs);

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    await logHealth(client, "backfill-benchmarks", "error", message, latencyMs);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
