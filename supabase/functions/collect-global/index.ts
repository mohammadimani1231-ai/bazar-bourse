import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { fetchYahooQuote } from "../../../lib/data-sources/yahoo.ts";
import { yahooQuoteToGlobalQuoteRow, type GlobalQuoteRow } from "../../../lib/transforms/globalQuote.ts";

const YAHOO_ASSETS: [symbol: string, asset: string][] = [
  ["BZ=F", "brent"],
  ["GC=F", "gold_ounce"],
  ["HG=F", "copper"],
  ["DX-Y.NYB", "dxy"],
  ["^GSPC", "sp500"],
];

// ۲۰۲۶-۰۸-۰۹: بخش داخلی (BrsApi سکه/طلا/دلار) از اینجا حذف شد — طبق تأیید خودِ پشتیبانی BrsApi
// (رجوع به CLAUDE.md)، سرورهایشان در ایران است و اتصال از IP خارج از ایران (Supabase) روی
// «دستکاری اینترنت بین‌الملل» می‌خورد، نه چیزی که با retry حل شود. آن بخش حالا مستقل روی یک
// VPS ایرانی اجرا می‌شود (scripts/vps-relay/relay.mjs، source='collect-global-domestic' در
// pipeline_health). اینجا فقط Yahoo (بین‌المللی) می‌ماند چون از IP Supabase مشکلی نداشت.
Deno.serve(async () => {
  const start = performance.now();
  const client = createServiceClient();
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

  if (rows.length > 0) {
    const { error: insertError } = await client.from("global_quotes").insert(rows);
    if (insertError) errors.push(`insert: ${insertError.message}`);
  }

  const latencyMs = Math.round(performance.now() - start);
  const status = errors.length === 0 ? "ok" : "error";
  await logHealth(client, "collect-global", status, errors.join("; ") || `${rows.length} assets`, latencyMs);

  return new Response(JSON.stringify({ ok: errors.length === 0, inserted: rows.length, errors }), {
    status: rows.length === 0 && errors.length > 0 ? 500 : 200,
    headers: { "Content-Type": "application/json" },
  });
});
