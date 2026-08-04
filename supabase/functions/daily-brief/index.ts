import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { tehranDayBounds } from "../../../lib/time/tehranDay.ts";
import { downsampleToDaily } from "../../../lib/downsampleDaily.ts";
import { coinBubblePct } from "../../../lib/tension.ts";
import { buildEqualWeightIndex, type DatedValue } from "../../../lib/syntheticIndex.ts";
import { detectCorrelationBreaks } from "../../../lib/correlationBreaks.ts";
import { logReturns } from "../../../lib/stats.ts";
import { parseBriefResponse, type DailyBrief } from "../../../lib/briefSchema.ts";

// عیناً طبق پرامپت فاز ۶ — تغییرش نده
const SYSTEM_PROMPT = `تو یک تحلیلگر ارشد بازار سرمایه ایران هستی که برای یک معامله‌گر شخصی، تحلیل صبحگاهی
پیش از بازگشایی بازار تهیه می‌کنی.

## ورودی
JSON با بخش‌های: global (نفت برنت، انس طلا، مس، DXY، S&P500 با تغییر ۲۴س و ۷روزه)،
domestic (دلار آزاد، طلای ۱۸، حباب سکه)، tension_index، market_regime،
market (شاخص کل/هم‌وزن، ارزش معاملات خرد، خالص ورود پول حقیقی، صنایع پیشرو)،
signals (سیگنال‌های فعال موتور تکنیکال با تفکیک فاکتور)، news (تیترهای ۲۴ساعت اخیر)،
correlation_breaks (جفت‌هایی که همبستگی‌شان از نرم تاریخی شکسته).

## وظیفه
1. زمینه جهانی را به گروه‌های بورس ترجمه کن: نفت → پالایشی/پتروشیمی؛ انس و مس →
   فلزات/معدنی؛ دلار ریالی → صادرات‌محورها و کلیت بازار.
2. هر سیگنال فعال را با زمینه بسنج: هم‌راستا یا خلاف جریان.
3. یک ریسک اصلی روز مشخص کن.

## قواعد سخت — تخطی ممنوع
- هرگز عددی که در ورودی نیست نساز. داده‌ی غایب = صریح بنویس «داده موجود نیست».
- سیگنال جدید صادر نکن؛ فقط سیگنال‌های موجود را تأیید، تضعیف یا زمینه‌سازی کن.
- تحلیل ژئوپلیتیک فقط بر اساس بخش news و tension_index و market_regime ورودی.
  اگر خالی بودند، بنویس «داده خبری امروز موجود نیست» و از حافظه‌ی خودت درباره
  وضعیت سیاسی هیچ نگو.
- اگر market_regime برابر normal نیست، در signal_review صریح هشدار بده که اعتبار
  سیگنال‌های تکنیکال در رژیم تنش/توافق کاهش می‌یابد.
- برای هر ادعا سطح اطمینان: [قطعی از داده] / [استنتاج قوی] / [گمانه].
- هر ادعا باید به فیلد ورودی‌اش ارجاع بدهد (فیلد ref در خروجی).
- از عبارات قطعی مثل «حتماً رشد می‌کند» استفاده نکن.

## خروجی — دقیقاً این JSON، به فارسی، حداکثر ۲۵۰ کلمه
{
  "market_mood": "مثبت | خنثی | منفی",
  "summary": "۳-۴ جمله تصویر کلان",
  "sector_notes": [{"sector":"...","view":"...","confidence":"...","ref":"..."}],
  "signal_review": [{"symbol":"...","verdict":"هم‌راستا | خلاف زمینه","note":"...","ref":"..."}],
  "main_risk": "یک جمله"
}`;

const GLOBAL_ASSETS: [asset: string, label: string][] = [
  ["brent", "نفت برنت"],
  ["gold_ounce", "انس طلا"],
  ["copper", "مس"],
  ["dxy", "DXY"],
  ["sp500", "S&P 500"],
];

const REFINERY_SYMBOLS = ["شپنا", "شبندر", "شتران", "شبریز", "شسپا", "شراز"];
const METALS_SYMBOLS = ["فملی", "میدکو", "فایرا", "سیسکو", "هرمز", "ارفع", "کاوه", "آلومینا"];
const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 2000;

type Client = ReturnType<typeof createServiceClient>;

interface QuoteRow {
  price: number | null;
  captured_at: string;
}

/** نزدیک‌ترین رکورد به یک لحظهٔ هدف در یک سری زمانی مرتب‌شده (قدیم→جدید) */
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

async function callClaude(
  apiKey: string,
  userContent: string,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API error ${res.status}: ${body}`);
  }

  const json = await res.json();
  const text = (json.content ?? []).map((c: { type: string; text?: string }) => c.text ?? "").join("");
  return {
    text,
    inputTokens: json.usage?.input_tokens ?? 0,
    outputTokens: json.usage?.output_tokens ?? 0,
  };
}

Deno.serve(async () => {
  const start = performance.now();
  const client = createServiceClient();

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY تنظیم نشده");

    const now = new Date();
    const nowMs = now.getTime();
    const { date: today } = tehranDayBounds(now);
    const since8dIso = new Date(nowMs - 8 * 24 * 60 * 60_000).toISOString();
    const since24hIso = new Date(nowMs - 24 * 60 * 60_000).toISOString();

    // ===== ۱. global =====
    const globalHistories = await Promise.all(GLOBAL_ASSETS.map(([asset]) => fetchGlobalAssetWindow(client, asset, since8dIso)));
    const global: Record<string, { price: number | null; change_24h_pct: number | null; change_7d_pct: number | null }> = {};
    GLOBAL_ASSETS.forEach(([asset, label], i) => {
      const rows = globalHistories[i];
      const latest = rows.length > 0 ? rows[rows.length - 1].price : null;
      const ago24h = closestTo(rows, nowMs - 24 * 60 * 60_000, 12 * 60 * 60_000);
      const ago7d = closestTo(rows, nowMs - 7 * 24 * 60 * 60_000, 24 * 60 * 60_000);
      global[label] = { price: latest, change_24h_pct: pctChange(latest, ago24h), change_7d_pct: pctChange(latest, ago7d) };
    });

    // ===== ۲. domestic =====
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

    // ===== ۳. tension_index و market_regime =====
    const [{ data: tensionRow }, { data: regimeSetting }] = await Promise.all([
      client.from("global_quotes").select("price, captured_at").eq("asset", "tension_index").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
      client.from("settings").select("value").eq("key", "market_regime").maybeSingle(),
    ]);
    const tension_index = tensionRow?.price ?? null;
    const market_regime = (regimeSetting?.value as string | undefined) ?? "normal";

    // ===== ۴. market =====
    const [{ data: tedpixRows }, { data: tedpixEqRows }, { data: watchlist }, { data: quotesRaw }, { data: moneyFlowRaw }] = await Promise.all([
      client.from("benchmark_candles").select("close").eq("asset", "tedpix").order("date", { ascending: false }).limit(1),
      client.from("benchmark_candles").select("close").eq("asset", "tedpix_equal_weight").order("date", { ascending: false }).limit(1),
      client.from("watchlist").select("symbol, industry"),
      client.from("quotes").select("symbol, value, captured_at").order("captured_at", { ascending: false }).limit(200),
      client.from("tabloo_metrics").select("symbol, value, captured_at").eq("metric", "money_flow").order("captured_at", { ascending: false }).limit(200),
    ]);
    const industryOf = new Map((watchlist ?? []).map((w) => [w.symbol as string, (w.industry as string | null) ?? "سایر"]));

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
      const industry = industryOf.get(symbol) ?? "سایر";
      industryFlow.set(industry, (industryFlow.get(industry) ?? 0) + flow);
    }
    const topIndustries = [...industryFlow.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([industry, flow]) => ({ industry, net_money_flow: flow }));

    const market = {
      tedpix: tedpixRows?.[0]?.close ?? null,
      tedpix_equal_weight: tedpixEqRows?.[0]?.close ?? null,
      // «ارزش معاملات خرد» به‌طور مجزا در سیستم موجود نیست — این ارزش کل معاملات است، برچسب صریح
      total_trade_value_rial: totalTradeValue,
      net_real_money_flow_rial: netMoneyFlow,
      top_industries_by_money_flow: topIndustries,
    };

    // ===== ۵. signals =====
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

    // ===== ۶. news =====
    const { data: newsRaw } = await client
      .from("news_items")
      .select("title, source, published_at")
      .gte("published_at", since24hIso)
      .order("published_at", { ascending: false })
      .limit(30);
    const news = (newsRaw ?? []).map((n) => ({ title: n.title, source: n.source, published_at: n.published_at }));

    // ===== ۷. correlation_breaks =====
    // برنت/دلار به‌عنوان leader، ترکیب هم‌وزن صنعت پالایشی/فلزات به‌عنوان follower — همان
    // منطق پنل lead-lag نمای جهانی (app/global/page.tsx)، عیناً از lib/ مشترک.
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
    // detectCorrelationBreaks خودش دادهٔ ناکافی (مثلا برنت هنوز کم‌عمق) را ساکت نادیده می‌گیرد
    const correlation_breaks = detectCorrelationBreaks(
      [
        { label: "دلار آزاد × فلزات اساسی", seriesA: usdMetalsA, seriesB: usdMetalsB },
        { label: "برنت × پالایشی", seriesA: brentRefineryA, seriesB: brentRefineryB },
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

    // ===== فراخوانی Claude + اعتبارسنجی + یک retry =====
    let brief: DailyBrief | null = null;
    let lastError = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let attempt = 0; attempt < 2 && !brief; attempt++) {
      const { text, inputTokens, outputTokens } = await callClaude(apiKey, userContent);
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
      throw new Error(`اعتبارسنجی خروجی Claude بعد از یک retry شکست خورد: ${lastError}`);
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
