import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { fetchYahooQuote } from "../../../lib/data-sources/yahoo.ts";
import { fetchBrsApiGoldCurrency } from "../../../lib/data-sources/brsapi.ts";
import {
  yahooQuoteToGlobalQuoteRow,
  brsApiGoldCurrencyToGlobalQuoteRows,
  type GlobalQuoteRow,
} from "../../../lib/transforms/globalQuote.ts";

const YAHOO_ASSETS: [symbol: string, asset: string][] = [
  ["BZ=F", "brent"],
  ["GC=F", "gold_ounce"],
  ["HG=F", "copper"],
  ["DX-Y.NYB", "dxy"],
  ["^GSPC", "sp500"],
];

Deno.serve(async () => {
  const start = performance.now();
  const client = createServiceClient();
  const brsApiKey = Deno.env.get("BRSAPI_KEY") ?? "";
  const capturedAt = new Date().toISOString();
  const rows: GlobalQuoteRow[] = [];
  const errors: string[] = [];

  // هر منبع مستقل — خطای یکی نباید بقیه را متوقف کند.
  const yahooResults = await Promise.allSettled(
    YAHOO_ASSETS.map(async ([symbol, asset]) => {
      const quote = await fetchYahooQuote(symbol);
      return yahooQuoteToGlobalQuoteRow(asset, quote, capturedAt);
    }),
  );
  yahooResults.forEach((result, i) => {
    const [, asset] = YAHOO_ASSETS[i];
    if (result.status === "fulfilled") {
      rows.push(result.value);
    } else {
      errors.push(`yahoo:${asset}: ${result.reason}`);
    }
  });

  try {
    const goldCurrency = await fetchBrsApiGoldCurrency(brsApiKey);
    rows.push(...brsApiGoldCurrencyToGlobalQuoteRows(goldCurrency, capturedAt));
  } catch (err) {
    errors.push(`brsapi-gold-currency: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (rows.length > 0) {
    const { error: insertError } = await client.from("global_quotes").insert(rows);
    if (insertError) errors.push(`insert: ${insertError.message}`);
  }

  const latencyMs = Math.round(performance.now() - start);
  const status = errors.length === 0 ? "ok" : rows.length > 0 ? "ok" : "error";
  await logHealth(client, "collect-global", status, errors.join("; ") || `${rows.length} assets`, latencyMs);

  return new Response(JSON.stringify({ ok: errors.length === 0, inserted: rows.length, errors }), {
    status: rows.length === 0 && errors.length > 0 ? 500 : 200,
    headers: { "Content-Type": "application/json" },
  });
});
