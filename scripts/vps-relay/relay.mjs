// سرویس دائمی روی VPS ایرانی — جایگزین موقت collect-tse/collect-market-index/بخش داخلی
// collect-global که از IP سرور Supabase (خارج از ایران) به‌طور کامل به BrsApi وصل نمی‌شوند
// (تأیید پشتیبانی BrsApi: مشکل مسیریابی بین‌الملل ایران، رجوع به CLAUDE.md).
//
// منطق تجاری (تبدیل داده، تشخیص باز/بسته بودن بازار) عیناً از lib/ پروژه import می‌شود —
// بدون پیاده‌سازی موازی، طبق قید #۳ پروژه. فقط لایهٔ Deno.env/createServiceClient با
// process.env/@supabase-js معادل Node جایگزین شده (چون این اسکریپت روی Node اجرا می‌شود).
//
// اجرا: node relay.mjs <tse|market-index|global-domestic>
// (روی VPS با tsx اجرا می‌شود تا importهای .ts مستقیم از lib/ کار کنند — به README.md همین پوشه رجوع کن.)

import { createClient } from "@supabase/supabase-js";
import { isMarketOpen } from "../../lib/market-status.ts";
import { fetchBrsApiAllSymbols, fetchBrsApiIndex, fetchBrsApiGoldCurrency } from "../../lib/data-sources/brsapi.ts";
import { brsApiRowToQuoteRow } from "../../lib/transforms/quote.ts";
import { brsApiGoldCurrencyToGlobalQuoteRows } from "../../lib/transforms/globalQuote.ts";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BRSAPI_KEY = process.env.BRSAPI_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !BRSAPI_KEY) {
  console.error("خطا: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BRSAPI_KEY باید ست شده باشند.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function logHealth(source, status, detail, latencyMs) {
  await supabase.from("pipeline_health").insert({ source, status, detail, latency_ms: latencyMs });
}

/** معادل checkMarketOpenLight در supabase/functions/_shared/marketStatus.ts (بدون heuristic حجم — همان دلیل آنجا). */
async function checkMarketOpenLight() {
  const { data: holidayRows } = await supabase.from("market_holidays").select("date");
  const holidayDates = new Set((holidayRows ?? []).map((r) => r.date));
  return isMarketOpen({ nowUtc: new Date(), holidayDates, recentVolumes: [] });
}

async function runTse() {
  const start = Date.now();
  try {
    const marketStatus = await checkMarketOpenLight();
    if (!marketStatus.open) {
      await logHealth("collect-tse", "market_closed", marketStatus.reason, Date.now() - start);
      console.log("market_closed:", marketStatus.reason);
      return;
    }

    const { data: watchlist, error: watchlistError } = await supabase.from("watchlist").select("symbol");
    if (watchlistError) throw watchlistError;
    const symbols = new Set((watchlist ?? []).map((w) => w.symbol));

    const allSymbols = await fetchBrsApiAllSymbols(BRSAPI_KEY);
    const capturedAt = new Date().toISOString();
    const rows = allSymbols
      .filter((row) => row.l18 && symbols.has(row.l18))
      .map((row) => brsApiRowToQuoteRow(row.l18, row, capturedAt));

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("quotes").insert(rows);
      if (insertError) throw insertError;
    }

    const latencyMs = Date.now() - start;
    await logHealth("collect-tse", "ok", `${rows.length}/${symbols.size} symbols (via VPS relay)`, latencyMs);
    console.log(`ok: ${rows.length}/${symbols.size} symbols, ${latencyMs}ms`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logHealth("collect-tse", "error", message, Date.now() - start);
    console.error("error:", message);
    process.exitCode = 1;
  }
}

async function runMarketIndex() {
  const start = Date.now();
  try {
    const marketStatus = await checkMarketOpenLight();
    if (!marketStatus.open) {
      await logHealth("collect-market-index", "market_closed", marketStatus.reason, Date.now() - start);
      console.log("market_closed:", marketStatus.reason);
      return;
    }

    const summary = await fetchBrsApiIndex(BRSAPI_KEY);
    const { error: insertError } = await supabase.from("market_index_quotes").insert({
      index_value: summary.index,
      index_change: summary.index_change,
      index_equal_weight: summary.index_equalWeight,
      index_equal_weight_change: summary.index_equalWeight_change,
      market_value: summary.mv,
      total_trade_value: summary.tval,
      total_trade_count: summary.tno,
      total_trade_volume: summary.tvol,
      market_state: summary.state,
    });
    if (insertError) throw insertError;

    const latencyMs = Date.now() - start;
    await logHealth("collect-market-index", "ok", `index=${summary.index} state=${summary.state} (via VPS relay)`, latencyMs);
    console.log(`ok: index=${summary.index}, ${latencyMs}ms`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logHealth("collect-market-index", "error", message, Date.now() - start);
    console.error("error:", message);
    process.exitCode = 1;
  }
}

/**
 * فقط بخش داخلی BrsApi (سکه/طلا/دلار). بخش Yahoo (بین‌المللی) همچنان روی خودِ Supabase
 * (collect-global) می‌ماند چون از IP آنجا مشکلی ندارد — منبع جدا در pipeline_health
 * (source='collect-global-domestic') تا با وضعیت collect-global قاطی نشود.
 */
async function runGlobalDomestic() {
  const start = Date.now();
  try {
    const goldCurrency = await fetchBrsApiGoldCurrency(BRSAPI_KEY);
    const capturedAt = new Date().toISOString();
    const rows = brsApiGoldCurrencyToGlobalQuoteRows(goldCurrency, capturedAt);

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("global_quotes").insert(rows);
      if (insertError) throw insertError;
    }

    const latencyMs = Date.now() - start;
    await logHealth("collect-global-domestic", "ok", `${rows.length} assets (via VPS relay)`, latencyMs);
    console.log(`ok: ${rows.length} assets, ${latencyMs}ms`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logHealth("collect-global-domestic", "error", message, Date.now() - start);
    console.error("error:", message);
    process.exitCode = 1;
  }
}

const job = process.argv[2];
if (job === "tse") await runTse();
else if (job === "market-index") await runMarketIndex();
else if (job === "global-domestic") await runGlobalDomestic();
else {
  console.error("Usage: node relay.mjs <tse|market-index|global-domestic>");
  process.exit(1);
}
