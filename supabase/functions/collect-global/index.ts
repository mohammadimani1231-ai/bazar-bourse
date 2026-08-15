import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { withJwtSkewRetry } from "../_shared/jwtSkewRetry.ts";
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
    // «JWT issued at future» — اسکیوی گذرای ساعت زیر بار Supabase (مستند در CLAUDE.md، همان
    // چیزی که evaluate-alerts هم می‌گرفت)، نه یک secret اشتباه — همان createServiceClient
    // مشترک با بقیهٔ توابع است و فقط گاهی (~۳٪ اجراها) رخ می‌دهد. PGRST303 یک رد شدن در لایهٔ
    // auth PostgREST است (قبل از رسیدن درخواست به دیتابیس)، پس retry ذاتاً امن است؛ upsert
    // (به‌جای insert) روی همان (asset, captured_at) هم دفاع در عمق است، مستقل از این استدلال —
    // اگر روزی retry دیگری (مثلاً روی یک خطای شبکهٔ نامعلوم) اضافه شد، باز هم duplicate نمی‌سازد.
    try {
      await withJwtSkewRetry(async () => {
        const { error: insertError } = await client
          .from("global_quotes")
          .upsert(rows, { onConflict: "asset,captured_at" });
        if (insertError) throw insertError;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`insert: ${message}`);
    }
  }

  const latencyMs = Math.round(performance.now() - start);
  const status = errors.length === 0 ? "ok" : "error";
  await logHealth(client, "collect-global", status, errors.join("; ") || `${rows.length} assets`, latencyMs);

  return new Response(JSON.stringify({ ok: errors.length === 0, inserted: rows.length, errors }), {
    status: rows.length === 0 && errors.length > 0 ? 500 : 200,
    headers: { "Content-Type": "application/json" },
  });
});
