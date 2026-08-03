import { toGregorian } from "npm:jalaali-js@1";
import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { fetchWithRetry } from "../../../lib/data-sources/http.ts";

const HISTORY_URL = "https://Api.BrsApi.ir/Tsetmc/History.php";
const DAYS_OF_HISTORY = 130;

interface HistoryEntry {
  date: string;
  Buy_CountI?: number;
  Buy_I_Volume?: number;
  Sell_CountI?: number;
  Sell_I_Volume?: number;
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    try {
      return JSON.stringify(err);
    } catch {
      return Object.prototype.toString.call(err);
    }
  }
  return String(err);
}

function jalaliToGregorian(jalaliDate: string): string | null {
  const parts = jalaliDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return null;
  const [jy, jm, jd] = parts;
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

/**
 * یک‌بارمصرف (اجرای دوباره بی‌خطر است — idempotent): از BrsApi Tsetmc/History.php?type=1
 * تاریخچهٔ واقعی حقیقی/حقوقی هر نماد watchlist را می‌گیرد و در daily_candles merge می‌کند —
 * دقیقاً معادل scripts/backfill_buyer_breakdown.py، فقط چون IP بعضی محیط‌های اجرای محلی از سمت
 * BrsApi ریست می‌شود، این نسخه از IP خود Supabase (که مسدود نیست) صدا می‌زند.
 */
Deno.serve(async () => {
  const start = performance.now();
  const client = createServiceClient();
  const brsApiKey = Deno.env.get("BRSAPI_KEY") ?? "";

  try {
    const { data: watchlist, error: watchlistError } = await client.from("watchlist").select("symbol");
    if (watchlistError) throw watchlistError;
    const symbols = (watchlist ?? []).map((w) => w.symbol as string);

    const results: Record<string, number | string> = {};
    let totalRows = 0;

    for (const symbol of symbols) {
      try {
        const url = `${HISTORY_URL}?key=${encodeURIComponent(brsApiKey)}&type=1&l18=${encodeURIComponent(symbol)}`;
        const res = await fetchWithRetry(url, {}, { timeoutMs: 30000, retries: 2 });
        const entries = (await res.json()) as HistoryEntry[];

        const rows = entries
          .slice(0, DAYS_OF_HISTORY)
          .map((e) => {
            const date = jalaliToGregorian(e.date);
            if (!date) return null;
            return {
              symbol,
              date,
              buy_i_volume: e.Buy_I_Volume ?? null,
              sell_i_volume: e.Sell_I_Volume ?? null,
              buy_count_i: e.Buy_CountI ?? null,
              sell_count_i: e.Sell_CountI ?? null,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);

        if (rows.length > 0) {
          const { error: upsertError } = await client
            .from("daily_candles")
            .upsert(rows, { onConflict: "symbol,date" });
          if (upsertError) throw upsertError;
        }

        results[symbol] = rows.length;
        totalRows += rows.length;
      } catch (err) {
        results[symbol] = `error: ${describeError(err)}`;
      }
    }

    const latencyMs = Math.round(performance.now() - start);
    await logHealth(
      client,
      "backfill-buyer-breakdown",
      "ok",
      `${totalRows} rows across ${symbols.length} symbols`,
      latencyMs,
    );

    return new Response(JSON.stringify({ ok: true, totalRows, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message = describeError(err);
    await logHealth(client, "backfill-buyer-breakdown", "error", message, latencyMs);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
