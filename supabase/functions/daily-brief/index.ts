import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { tehranDayBounds } from "../../../lib/time/tehranDay.ts";
import { downsampleToDaily } from "../../../lib/downsampleDaily.ts";
import { coinBubblePct } from "../../../lib/tension.ts";
import { buildEqualWeightIndex, type DatedValue } from "../../../lib/syntheticIndex.ts";
import { detectCorrelationBreaks } from "../../../lib/correlationBreaks.ts";
import { logReturns } from "../../../lib/stats.ts";
import { parseBriefResponse, type DailyBrief } from "../../../lib/briefSchema.ts";

// Ø¹ÛŒÙ†Ø§Ù‹ Ø·Ø¨Ù‚ Ù¾Ø±Ø§Ù…Ù¾Øª ÙØ§Ø² Û¶ â€” ØªØºÛŒÛŒØ±Ø´ Ù†Ø¯Ù‡
const SYSTEM_PROMPT = `ØªÙˆ ÛŒÚ© ØªØ­Ù„ÛŒÙ„Ú¯Ø± Ø§Ø±Ø´Ø¯ Ø¨Ø§Ø²Ø§Ø± Ø³Ø±Ù…Ø§ÛŒÙ‡ Ø§ÛŒØ±Ø§Ù† Ù‡Ø³ØªÛŒ Ú©Ù‡ Ø¨Ø±Ø§ÛŒ ÛŒÚ© Ù…Ø¹Ø§Ù…Ù„Ù‡â€ŒÚ¯Ø± Ø´Ø®ØµÛŒØŒ ØªØ­Ù„ÛŒÙ„ ØµØ¨Ø­Ú¯Ø§Ù‡ÛŒ
Ù¾ÛŒØ´ Ø§Ø² Ø¨Ø§Ø²Ú¯Ø´Ø§ÛŒÛŒ Ø¨Ø§Ø²Ø§Ø± ØªÙ‡ÛŒÙ‡ Ù…ÛŒâ€ŒÚ©Ù†ÛŒ.
## ÙˆØ±ÙˆØ¯ÛŒ
JSON Ø¨Ø§ Ø¨Ø®Ø´â€ŒÙ‡Ø§ÛŒ: global (Ù†ÙØª Ø¨Ø±Ù†ØªØŒ Ø§Ù†Ø³ Ø·Ù„Ø§ØŒ Ù…Ø³ØŒ DXYØŒ S&P500 Ø¨Ø§ ØªØºÛŒÛŒØ± Û²Û´Ø³ Ùˆ Û·Ø±ÙˆØ²Ù‡)ØŒ
domestic (Ø¯Ù„Ø§Ø± Ø¢Ø²Ø§Ø¯ØŒ Ø·Ù„Ø§ÛŒ Û±Û¸ØŒ Ø­Ø¨Ø§Ø¨ Ø³Ú©Ù‡)ØŒ tension_indexØŒ market_regimeØŒ
market (Ø´Ø§Ø®Øµ Ú©Ù„/Ù‡Ù…â€ŒÙˆØ²Ù†ØŒ Ø§Ø±Ø²Ø´ Ù…Ø¹Ø§Ù…Ù„Ø§Øª Ø®Ø±Ø¯ØŒ Ø®Ø§Ù„Øµ ÙˆØ±ÙˆØ¯ Ù¾ÙˆÙ„ Ø­Ù‚ÛŒÙ‚ÛŒØŒ ØµÙ†Ø§ÛŒØ¹ Ù¾ÛŒØ´Ø±Ùˆ)ØŒ
signals (Ø³ÛŒÚ¯Ù†Ø§Ù„â€ŒÙ‡Ø§ÛŒ ÙØ¹Ø§Ù„ Ù…ÙˆØªÙˆØ± ØªÚ©Ù†ÛŒÚ©Ø§Ù„ Ø¨Ø§ ØªÙÚ©ÛŒÚ© ÙØ§Ú©ØªÙˆØ±)ØŒ news (ØªÛŒØªØ±Ù‡Ø§ÛŒ Û²Û´Ø³Ø§Ø¹Øª Ø§Ø®ÛŒØ±)ØŒ
correlation_breaks (Ø¬ÙØªâ€ŒÙ‡Ø§ÛŒÛŒ Ú©Ù‡ Ù‡Ù…Ø¨Ø³ØªÚ¯ÛŒâ€ŒØ´Ø§Ù† Ø§Ø² Ù†Ø±Ù… ØªØ§Ø±ÛŒØ®ÛŒ Ø´Ú©Ø³ØªÙ‡).
## ÙˆØ¸ÛŒÙÙ‡
1. Ø²Ù…ÛŒÙ†Ù‡ Ø¬Ù‡Ø§Ù†ÛŒ Ø±Ø§ Ø¨Ù‡ Ú¯Ø±ÙˆÙ‡â€ŒÙ‡Ø§ÛŒ Ø¨ÙˆØ±Ø³ ØªØ±Ø¬Ù…Ù‡ Ú©Ù†: Ù†ÙØª â†’ Ù¾Ø§Ù„Ø§ÛŒØ´ÛŒ/Ù¾ØªØ±ÙˆØ´ÛŒÙ…ÛŒØ› Ø§Ù†Ø³ Ùˆ Ù…Ø³ â†’
   ÙÙ„Ø²Ø§Øª/Ù…Ø¹Ø¯Ù†ÛŒØ› Ø¯Ù„Ø§Ø± Ø±ÛŒØ§Ù„ÛŒ â†’ ØµØ§Ø¯Ø±Ø§Øªâ€ŒÙ…Ø­ÙˆØ±Ù‡Ø§ Ùˆ Ú©Ù„ÛŒØª Ø¨Ø§Ø²Ø§Ø±.
2. Ù‡Ø± Ø³ÛŒÚ¯Ù†Ø§Ù„ ÙØ¹Ø§Ù„ Ø±Ø§ Ø¨Ø§ Ø²Ù…ÛŒÙ†Ù‡ Ø¨Ø³Ù†Ø¬: Ù‡Ù…â€ŒØ±Ø§Ø³ØªØ§ ÛŒØ§ Ø®Ù„Ø§Ù Ø¬Ø±ÛŒØ§Ù†.
3. ÛŒÚ© Ø±ÛŒØ³Ú© Ø§ØµÙ„ÛŒ Ø±ÙˆØ² Ù…Ø´Ø®Øµ Ú©Ù†.
## Ù‚ÙˆØ§Ø¹Ø¯ Ø³Ø®Øª â€” ØªØ®Ø·ÛŒ Ù…Ù…Ù†ÙˆØ¹
- Ù‡Ø±Ú¯Ø² Ø¹Ø¯Ø¯ÛŒ Ú©Ù‡ Ø¯Ø± ÙˆØ±ÙˆØ¯ÛŒ Ù†ÛŒØ³Øª Ù†Ø³Ø§Ø². Ø¯Ø§Ø¯Ù‡â€ŒÛŒ ØºØ§ÛŒØ¨ = ØµØ±ÛŒØ­ Ø¨Ù†ÙˆÛŒØ³ Â«Ø¯Ø§Ø¯Ù‡ Ù…ÙˆØ¬ÙˆØ¯ Ù†ÛŒØ³ØªÂ».
- Ø³ÛŒÚ¯Ù†Ø§Ù„ Ø¬Ø¯ÛŒØ¯ ØµØ§Ø¯Ø± Ù†Ú©Ù†Ø› ÙÙ‚Ø· Ø³ÛŒÚ¯Ù†Ø§Ù„â€ŒÙ‡Ø§ÛŒ Ù…ÙˆØ¬ÙˆØ¯ Ø±Ø§ ØªØ£ÛŒÛŒØ¯ØŒ ØªØ¶Ø¹ÛŒÙ ÛŒØ§ Ø²Ù…ÛŒÙ†Ù‡â€ŒØ³Ø§Ø²ÛŒ Ú©Ù†.
- ØªØ­Ù„ÛŒÙ„ Ú˜Ø¦ÙˆÙ¾Ù„ÛŒØªÛŒÚ© ÙÙ‚Ø· Ø¨Ø± Ø§Ø³Ø§Ø³ Ø¨Ø®Ø´ news Ùˆ tension_index Ùˆ market_regime ÙˆØ±ÙˆØ¯ÛŒ.
  Ø§Ú¯Ø± Ø®Ø§Ù„ÛŒ Ø¨ÙˆØ¯Ù†Ø¯ØŒ Ø¨Ù†ÙˆÛŒØ³ Â«Ø¯Ø§Ø¯Ù‡ Ø®Ø¨Ø±ÛŒ Ø§Ù…Ø±ÙˆØ² Ù…ÙˆØ¬ÙˆØ¯ Ù†ÛŒØ³ØªÂ» Ùˆ Ø§Ø² Ø­Ø§ÙØ¸Ù‡â€ŒÛŒ Ø®ÙˆØ¯Øª Ø¯Ø±Ø¨Ø§Ø±Ù‡
  ÙˆØ¶Ø¹ÛŒØª Ø³ÛŒØ§Ø³ÛŒ Ù‡ÛŒÚ† Ù†Ú¯Ùˆ.
- Ø§Ú¯Ø± market_regime Ø¨Ø±Ø§Ø¨Ø± normal Ù†ÛŒØ³ØªØŒ Ø¯Ø± signal_review ØµØ±ÛŒØ­ Ù‡Ø´Ø¯Ø§Ø± Ø¨Ø¯Ù‡ Ú©Ù‡ Ø§Ø¹ØªØ¨Ø§Ø±
  Ø³ÛŒÚ¯Ù†Ø§Ù„â€ŒÙ‡Ø§ÛŒ ØªÚ©Ù†ÛŒÚ©Ø§Ù„ Ø¯Ø± Ø±Ú˜ÛŒÙ… ØªÙ†Ø´/ØªÙˆØ§ÙÙ‚ Ú©Ø§Ù‡Ø´ Ù…ÛŒâ€ŒÛŒØ§Ø¨Ø¯.
- Ø¨Ø±Ø§ÛŒ Ù‡Ø± Ø§Ø¯Ø¹Ø§ Ø³Ø·Ø­ Ø§Ø·Ù…ÛŒÙ†Ø§Ù†: [Ù‚Ø·Ø¹ÛŒ Ø§Ø² Ø¯Ø§Ø¯Ù‡] / [Ø§Ø³ØªÙ†ØªØ§Ø¬ Ù‚ÙˆÛŒ] / [Ú¯Ù…Ø§Ù†Ù‡].
- Ù‡Ø± Ø§Ø¯Ø¹Ø§ Ø¨Ø§ÛŒØ¯ Ø¨Ù‡ ÙÛŒÙ„Ø¯ ÙˆØ±ÙˆØ¯ÛŒâ€ŒØ§Ø´ Ø§Ø±Ø¬Ø§Ø¹ Ø¨Ø¯Ù‡Ø¯ (ÙÛŒÙ„Ø¯ ref Ø¯Ø± Ø®Ø±ÙˆØ¬ÛŒ).
- Ø§Ø² Ø¹Ø¨Ø§Ø±Ø§Øª Ù‚Ø·Ø¹ÛŒ Ù…Ø«Ù„ Â«Ø­ØªÙ…Ø§Ù‹ Ø±Ø´Ø¯ Ù…ÛŒâ€ŒÚ©Ù†Ø¯Â» Ø§Ø³ØªÙØ§Ø¯Ù‡ Ù†Ú©Ù†.
## Ø®Ø±ÙˆØ¬ÛŒ â€” Ø¯Ù‚ÛŒÙ‚Ø§Ù‹ Ø§ÛŒÙ† JSONØŒ Ø¨Ù‡ ÙØ§Ø±Ø³ÛŒØŒ Ø­Ø¯Ø§Ú©Ø«Ø± Û²ÛµÛ° Ú©Ù„Ù…Ù‡
{
  "market_mood": "Ù…Ø«Ø¨Øª | Ø®Ù†Ø«ÛŒ | Ù…Ù†ÙÛŒ",
  "summary": "Û³-Û´ Ø¬Ù…Ù„Ù‡ ØªØµÙˆÛŒØ± Ú©Ù„Ø§Ù†",
  "sector_notes": [{"sector":"...","view":"...","confidence":"...","ref":"..."}],
  "signal_review": [{"symbol":"...","verdict":"Ù‡Ù…â€ŒØ±Ø§Ø³ØªØ§ | Ø®Ù„Ø§Ù Ø²Ù…ÛŒÙ†Ù‡","note":"...","ref":"..."}],
  "main_risk": "ÛŒÚ© Ø¬Ù…Ù„Ù‡"
}`;

const GLOBAL_ASSETS: [asset: string, label: string][] = [
  ["brent", "Ù†ÙØª Ø¨Ø±Ù†Øª"],
  ["gold_ounce", "Ø§Ù†Ø³ Ø·Ù„Ø§"],
  ["copper", "Ù…Ø³"],
  ["dxy", "DXY"],
  ["sp500", "S&P 500"],
];

const REFINERY_SYMBOLS = ["Ø´Ù¾Ù†Ø§", "Ø´Ø¨Ù†Ø¯Ø±", "Ø´ØªØ±Ø§Ù†", "Ø´Ø¨Ø±ÛŒØ²", "Ø´Ø³Ù¾Ø§", "Ø´Ø±Ø§Ø²"];
const METALS_SYMBOLS = ["ÙÙ…Ù„ÛŒ", "Ù…ÛŒØ¯Ú©Ùˆ", "ÙØ§ÛŒØ±Ø§", "Ø³ÛŒØ³Ú©Ùˆ", "Ù‡Ø±Ù…Ø²", "Ø§Ø±ÙØ¹", "Ú©Ø§ÙˆÙ‡", "Ø¢Ù„ÙˆÙ…ÛŒÙ†Ø§"];

// â† ØªØºÛŒÛŒØ±: Gemini 1.5 Flash Ø±Ø§ÛŒÚ¯Ø§Ù†ØŒ Ø¬Ø§ÛŒÚ¯Ø²ÛŒÙ† Claude
const MODEL = "mixtral-8x7b-32768";
const MAX_TOKENS = 2000;

type Client = ReturnType<typeof createServiceClient>;

interface QuoteRow {
  price: number | null;
  captured_at: string;
}

/** Ù†Ø²Ø¯ÛŒÚ©â€ŒØªØ±ÛŒÙ† Ø±Ú©ÙˆØ±Ø¯ Ø¨Ù‡ ÛŒÚ© Ù„Ø­Ø¸Ù‡Ù” Ù‡Ø¯Ù Ø¯Ø± ÛŒÚ© Ø³Ø±ÛŒ Ø²Ù…Ø§Ù†ÛŒ Ù…Ø±ØªØ¨â€ŒØ´Ø¯Ù‡ (Ù‚Ø¯ÛŒÙ…â†’Ø¬Ø¯ÛŒØ¯) */
function closestTo(rows: QuoteRow[], targetMs: number, maxGapMs: number): number | null {
  let best: QuoteRow | null = null;
  let bestDiff = Infinity;
  for (const row of rows) {
    const diff = Math.abs(new Date(row.captured_at).getTime() - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = row;
    }
  }
  return best && bestDiff <= maxGapMs ? best.price : null;
}

function pctChange(current: number | null, prev: number | null): number | null {
  if (current == null || prev == null || prev === 0) return null;
  return Number((((current - prev) / prev) * 100).toFixed(2));
}

async function fetchGlobalAssetWindow(client: Client, asset: string, sinceIso: string): Promise<QuoteRow[]> {
  const { data } = await client
    .from("global_quotes")
    .select("price, captured_at")
    .eq("asset", asset)
    .gte("captured_at", sinceIso)
    .order("captured_at", { ascending: true })
    .limit(1000);
  return (data ?? []) as QuoteRow[];
}

async function fetchSymbolCloses(client: Client, symbol: string): Promise<DatedValue[]> {
  const { data } = await client
    .from("daily_candles")
    .select("date, final_price")
    .eq("symbol", symbol)
    .order("date", { ascending: false })
    .limit(120);
  return (data ?? [])
    .filter((r) => r.final_price != null)
    .map((r) => ({ date: r.date as string, value: r.final_price as number }))
    .reverse();
}

// â† ØªØºÛŒÛŒØ±: callClaude â†’ callGemini (REST API Ù…Ø³ØªÙ‚ÛŒÙ…ØŒ Ø¨Ø¯ÙˆÙ† Ù†ÛŒØ§Ø² Ø¨Ù‡ SDK)
async function callGroq(
  apiKey: string,
  userContent: string,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const res = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        max_tokens: MAX_TOKENS,
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq API error ${res.status}: ${body}`);
  }
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content ?? "";
  return {
    text,
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}

Deno.serve(async () => {
  const start = performance.now();
  const client = createServiceClient();

  try {
    // â† ØªØºÛŒÛŒØ±: ANTHROPIC_API_KEY â†’ GROQ_API_KEY
    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) throw new Error("GROQ_API_KEY ØªÙ†Ø¸ÛŒÙ… Ù†Ø´Ø¯Ù‡");

    const now = new Date();
    const nowMs = now.getTime();
    const { date: today } = tehranDayBounds(now);
    const since8dIso = new Date(nowMs - 8 * 24 * 60 * 60_000).toISOString();
    const since24hIso = new Date(nowMs - 24 * 60 * 60_000).toISOString();

    // ===== Û±. global =====
    const globalHistories = await Promise.all(GLOBAL_ASSETS.map(([asset]) => fetchGlobalAssetWindow(client, asset, since8dIso)));
    const global: Record<string, { price: number | null; change_24h_pct: number | null; change_7d_pct: number | null }> = {};
    GLOBAL_ASSETS.forEach(([asset, label], i) => {
      const rows = globalHistories[i];
      const latest = rows.length > 0 ? rows[rows.length - 1].price : null;
      const ago24h = closestTo(rows, nowMs - 24 * 60 * 60_000, 12 * 60 * 60_000);
      const ago7d = closestTo(rows, nowMs - 7 * 24 * 60 * 60_000, 24 * 60 * 60_000);
      global[label] = { price: latest, change_24h_pct: pctChange(latest, ago24h), change_7d_pct: pctChange(latest, ago7d) };
    });

    // ===== Û². domestic =====
    const [usdIrrRows, gold18kRows, coinEmamiRows, goldOunceRows] = await Promise.all([
      fetchGlobalAssetWindow(client, "usd_irr", since8dIso),
      fetchGlobalAssetWindow(client, "gold_18k", since8dIso),
      fetchGlobalAssetWindow(client, "coin_emami", since8dIso),
      fetchGlobalAssetWindow(client, "gold_ounce", since8dIso),
    ]);
    const usdIrrLatest = usdIrrRows.length > 0 ? usdIrrRows[usdIrrRows.length - 1].price : null;
    const gold18kLatest = gold18kRows.length > 0 ? gold18kRows[gold18kRows.length - 1].price : null;
    const coinEmamiLatest = coinEmamiRows.length > 0 ? coinEmamiRows[coinEmamiRows.length - 1].price : null;
    const goldOunceLatest = goldOunceRows.length > 0 ? goldOunceRows[goldOunceRows.length - 1].price : null;
    const domestic = {
      usd_irr: usdIrrLatest,
      usd_irr_change_24h_pct: pctChange(usdIrrLatest, closestTo(usdIrrRows, nowMs - 24 * 60 * 60_000, 12 * 60 * 60_000)),
      gold_18k: gold18kLatest,
      gold_18k_change_24h_pct: pctChange(gold18kLatest, closestTo(gold18kRows, nowMs - 24 * 60 * 60_000, 12 * 60 * 60_000)),
      coin_bubble_pct: Number(coinBubblePct(coinEmamiLatest, goldOunceLatest, usdIrrLatest)?.toFixed(2) ?? null) || null,
    };

    // ===== Û³. tension_index Ùˆ market_regime =====
    const [{ data: tensionRow }, { data: regimeSetting }] = await Promise.all([
      client.from("global_quotes").select("price, captured_at").eq("asset", "tension_index").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
      client.from("settings").select("value").eq("key", "market_regime").maybeSingle(),
    ]);
    const tension_index = tensionRow?.price ?? null;
    const market_regime = (regimeSetting?.value as string | undefined) ?? "normal";

    // ===== Û´. market =====
    const [{ data: tedpixRows }, { data: tedpixEqRows }, { data: watchlist }, { data: quotesRaw }, { data: moneyFlowRaw }] = await Promise.all([
      client.from("benchmark_candles").select("close").eq("asset", "tedpix").order("date", { ascending: false }).limit(1),
      client.from("benchmark_candles").select("close").eq("asset", "tedpix_equal_weight").order("date", { ascending: false }).limit(1),
      client.from("watchlist").select("symbol, industry"),
      client.from("quotes").select("symbol, value, captured_at").order("captured_at", { ascending: false }).limit(200),
      client.from("tabloo_metrics").select("symbol, value, captured_at").eq("metric", "money_flow").order("captured_at", { ascending: false }).limit(200),
    ]);
    const industryOf = new Map((watchlist ?? []).map((w) => [w.symbol as string, (w.industry as string | null) ?? "Ø³Ø§ÛŒØ±"]));
    const latestValueBySymbol = new Map<string, number>();
    for (const q of quotesRaw ?? []) {
      if (!latestValueBySymbol.has(q.symbol) && q.value != null) latestValueBySymbol.set(q.symbol, q.value);
    }
    const totalTradeValue = [...latestValueBySymbol.values()].reduce((a, b) => a + b, 0) || null;
    const latestMoneyFlowBySymbol = new Map<string, number>();
    for (const m of moneyFlowRaw ?? []) {
      if (!latestMoneyFlowBySymbol.has(m.symbol) && m.value != null) latestMoneyFlowBySymbol.set(m.symbol, m.value);
    }
    const netMoneyFlow = [...latestMoneyFlowBySymbol.values()].reduce((a, b) => a + b, 0) || null;
    const industryFlow = new Map<string, number>();
    for (const [symbol, flow] of latestMoneyFlowBySymbol) {
      const industry = industryOf.get(symbol) ?? "Ø³Ø§ÛŒØ±";
      industryFlow.set(industry, (industryFlow.get(industry) ?? 0) + flow);
    }
    const topIndustries = [...industryFlow.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([industry, flow]) => ({ industry, net_money_flow: flow }));
    const market = {
      tedpix: tedpixRows?.[0]?.close ?? null,
      tedpix_equal_weight: tedpixEqRows?.[0]?.close ?? null,
      // Â«Ø§Ø±Ø²Ø´ Ù…Ø¹Ø§Ù…Ù„Ø§Øª Ø®Ø±Ø¯Â» Ø¨Ù‡â€ŒØ·ÙˆØ± Ù…Ø¬Ø²Ø§ Ø¯Ø± Ø³ÛŒØ³ØªÙ… Ù…ÙˆØ¬ÙˆØ¯ Ù†ÛŒØ³Øª â€” Ø§ÛŒÙ† Ø§Ø±Ø²Ø´ Ú©Ù„ Ù…Ø¹Ø§Ù…Ù„Ø§Øª Ø§Ø³ØªØŒ Ø¨Ø±Ú†Ø³Ø¨ ØµØ±ÛŒØ­
      total_trade_value_rial: totalTradeValue,
      net_real_money_flow_rial: netMoneyFlow,
      top_industries_by_money_flow: topIndustries,
    };

    // ===== Ûµ. signals =====
    const { data: signalsRaw } = await client
      .from("signals")
      .select("symbol, direction, score, reasons, created_at")
      .gte("created_at", since24hIso)
      .order("created_at", { ascending: false })
      .limit(50);
    const signals = (signalsRaw ?? []).map((s) => ({
      symbol: s.symbol,
      direction: s.direction,
      score: s.score,
      factors: s.reasons,
    }));

    // ===== Û¶. news =====
    const { data: newsRaw } = await client
      .from("news_items")
      .select("title, source, published_at")
      .gte("published_at", since24hIso)
      .order("published_at", { ascending: false })
      .limit(30);
    const news = (newsRaw ?? []).map((n) => ({ title: n.title, source: n.source, published_at: n.published_at }));

    // ===== Û·. correlation_breaks =====
    const [refineryCloses, metalsCloses, usdIrrDailyRows, brentQuotesRaw] = await Promise.all([
      Promise.all(REFINERY_SYMBOLS.map((s) => fetchSymbolCloses(client, s))),
      Promise.all(METALS_SYMBOLS.map((s) => fetchSymbolCloses(client, s))),
      client.from("benchmark_candles").select("date, close").eq("asset", "usd_irr").order("date", { ascending: false }).limit(120),
      fetchGlobalAssetWindow(client, "brent", since8dIso),
    ]);
    const refineryIndex = buildEqualWeightIndex(refineryCloses);
    const metalsIndex = buildEqualWeightIndex(metalsCloses);
    const usdIrrDaily: DatedValue[] = (usdIrrDailyRows.data ?? [])
      .slice()
      .reverse()
      .map((r) => ({ date: r.date as string, value: r.close as number }));
    const brentDaily: DatedValue[] = downsampleToDaily(brentQuotesRaw);

    function alignedReturns(a: DatedValue[], b: DatedValue[]): [number[], number[]] {
      const bByDate = new Map(b.map((p) => [p.date, p.value]));
      const common = a.map((p) => p.date).filter((d) => bByDate.has(d)).sort();
      const aByDate = new Map(a.map((p) => [p.date, p.value]));
      return [logReturns(common.map((d) => aByDate.get(d)!)), logReturns(common.map((d) => bByDate.get(d)!))];
    }

    const [usdMetalsA, usdMetalsB] = alignedReturns(usdIrrDaily, metalsIndex);
    const [brentRefineryA, brentRefineryB] = alignedReturns(brentDaily, refineryIndex);
    const correlation_breaks = detectCorrelationBreaks(
      [
        { label: "Ø¯Ù„Ø§Ø± Ø¢Ø²Ø§Ø¯ Ã— ÙÙ„Ø²Ø§Øª Ø§Ø³Ø§Ø³ÛŒ", seriesA: usdMetalsA, seriesB: usdMetalsB },
        { label: "Ø¨Ø±Ù†Øª Ã— Ù¾Ø§Ù„Ø§ÛŒØ´ÛŒ", seriesA: brentRefineryA, seriesB: brentRefineryB },
      ],
      30,
      0.4,
    ).map((b) => ({
      pair: b.pairLabel,
      current_correlation: Number(b.currentCorrelation.toFixed(2)),
      historical_mean_correlation: Number(b.historicalMeanCorrelation.toFixed(2)),
    }));

    const inputSnapshot = { global, domestic, tension_index, market_regime, market, signals, news, correlation_breaks };
    const userContent = JSON.stringify(inputSnapshot);

    // ===== ÙØ±Ø§Ø®ÙˆØ§Ù†ÛŒ Gemini + Ø§Ø¹ØªØ¨Ø§Ø±Ø³Ù†Ø¬ÛŒ + ÛŒÚ© retry =====
    let brief: DailyBrief | null = null;
    let lastError = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let attempt = 0; attempt < 2 && !brief; attempt++) {
      // â† ØªØºÛŒÛŒØ±: callClaude â†’ callGemini
      const { text, inputTokens, outputTokens } = await callGroq(apiKey, userContent);
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      const parsed = parseBriefResponse(text);
      if (parsed.success) {
        brief = parsed.data;
      } else {
        lastError = parsed.error;
      }
    }

    if (!brief) {
      throw new Error(`Ø§Ø¹ØªØ¨Ø§Ø±Ø³Ù†Ø¬ÛŒ Ø®Ø±ÙˆØ¬ÛŒ Gemini Ø¨Ø¹Ø¯ Ø§Ø² ÛŒÚ© retry Ø´Ú©Ø³Øª Ø®ÙˆØ±Ø¯: ${lastError}`);
    }

    const { error: insertError } = await client.from("ai_briefs").insert({
      brief,
      input_snapshot: inputSnapshot,
      meta: { model: MODEL, input_tokens: totalInputTokens, output_tokens: totalOutputTokens, date: today },
    });
    if (insertError) throw insertError;

    const latencyMs = Math.round(performance.now() - start);
    await logHealth(client, "daily-brief", "ok", `mood=${brief.market_mood} tokens=${totalInputTokens}/${totalOutputTokens}`, latencyMs);

    return new Response(JSON.stringify({ ok: true, brief }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    await logHealth(client, "daily-brief", "error", message, latencyMs);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});


