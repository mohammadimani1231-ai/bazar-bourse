"use server";

import { createAdminSupabaseClient } from "@/lib/supabase/adminClient.ts";
import { tehranDayBounds } from "@/lib/time/tehranDay.ts";
import { buildEqualWeightIndex, type DatedValue } from "@/lib/syntheticIndex.ts";
import { crossCorrelation, bestLag, logReturns } from "@/lib/stats.ts";
import { computeJalaliSeasonality } from "@/lib/seasonality.ts";
import { formatFaNumber, formatFaCompactRial, formatFaPercent } from "@/lib/format.ts";
import { formatJalaliDay, formatJalaliDateTime } from "@/lib/jalali.ts";
import { renderReportShell, renderReportSection, renderReportTable, renderReportParagraph } from "@/lib/reportHtml.ts";
import { renderLineChartSvg } from "@/lib/reportCharts.ts";
import { parseWeeklySummaryResponse } from "@/lib/weeklyBriefSchema.ts";
import { findContinuityGap } from "@/lib/priceContinuity.ts";

const MODEL = "claude-sonnet-5";

const SYMBOL_SUMMARY_SYSTEM_PROMPT = `تو یک تحلیلگر ارشد بازار سرمایه ایران هستی که جمع‌بندی یک گزارش عمیق تک‌نماد را می‌نویسی.
این خلاصه فقط یک بخش از گزارش بزرگ‌تر است؛ بقیهٔ بخش‌ها (جدول‌ها و اعداد) جدا و مستقیم از
دیتابیس تولید می‌شوند.

## قواعد سخت — تخطی ممنوع
- هرگز عددی که در ورودی نیست نساز. داده‌ی غایب = صریح بنویس «داده موجود نیست».
- سیگنال جدید صادر نکن؛ فقط دربارهٔ داده‌های موجود اظهار نظر کن.
- هر ادعا باید سطح اطمینان داشته باشد: قطعی از داده / استنتاج قوی / گمانه، و به فیلد
  ورودی‌اش با ref ارجاع بدهد.
- از عبارات قطعی مثل «حتماً» استفاده نکن.

## خروجی — دقیقاً این JSON، به فارسی
{
  "summary": "۳-۵ جملهٔ جمع‌بندی نماد",
  "key_points": [{"point":"...","confidence":"قطعی از داده | استنتاج قوی | گمانه","ref":"..."}]
}`;

type Client = ReturnType<typeof createAdminSupabaseClient>;

function pctChange(current: number | null, prev: number | null): number | null {
  if (current == null || prev == null || prev === 0) return null;
  return Number((((current - prev) / prev) * 100).toFixed(2));
}

async function fetchCandles(client: Client, symbol: string, limit = 1300) {
  const { data } = await client
    .from("daily_candles")
    .select("date, close, adjusted_close, final_price")
    .eq("symbol", symbol)
    .order("date", { ascending: false })
    .limit(limit);
  return (data ?? []).slice().reverse();
}

export async function generateSymbolReport(symbol: string): Promise<{ ok: boolean; id?: number; error?: string }> {
  const client = createAdminSupabaseClient();

  try {
    const { data: watchlistRow } = await client.from("watchlist").select("symbol, industry").eq("symbol", symbol).maybeSingle();
    if (!watchlistRow) return { ok: false, error: "نماد در واچ‌لیست نیست" };
    const industry = (watchlistRow.industry as string | null) ?? "سایر";

    const now = new Date();
    const nowMs = now.getTime();
    const { date: todayStr } = tehranDayBounds(now);
    const dataSnapshot: Record<string, unknown> = { symbol, industry, generated_at: now.toISOString() };
    const sections: string[] = [];

    const candles = await fetchCandles(client, symbol);

    // ===== ۱. پروفایل =====
    sections.push(
      renderReportSection(
        "۱. پروفایل",
        renderReportParagraph(`صنعت: ${industry}`) +
          renderReportParagraph("ارزش بازار و P/E: دادهٔ بنیادی (سهام در گردش، سود هر سهم) در سیستم موجود نیست."),
      ),
    );

    // ===== ۲. عملکرد قیمت =====
    const dateAt = (daysAgo: number) => tehranDayBounds(new Date(nowMs - daysAgo * 24 * 60 * 60_000)).date;
    const closeAtOrBefore = (dateStr: string) => {
      const row = [...candles].reverse().find((c) => c.date <= dateStr && c.adjusted_close != null);
      return row?.adjusted_close ?? null;
    };
    const latestClose = [...candles].reverse().find((c) => c.adjusted_close != null)?.adjusted_close ?? null;
    // اگر بین ابتدا و انتهای بازه یک وقفهٔ معاملاتی >۱۰ روزه همراه با جهش/افت >۳۰٪ باشد (نشانهٔ
    // محتمل توقف نماد/افزایش سرمایه)، بازدهی گمراه‌کننده است — adjusted_close این پروژه
    // split-adjustment واقعی اعمال نمی‌کند (کشف‌شده حین بررسی پارسان، ۲۰۲۶-۰۸-۱۵).
    const closesForGapCheck = candles.map((c) => ({ date: c.date as string, close: c.adjusted_close }));
    const perfWindows: { label: string; days: number }[] = [
      { label: "۱ ماه", days: 30 },
      { label: "۳ ماه", days: 90 },
      { label: "۱ سال", days: 365 },
    ];
    const perfEntries = perfWindows.map(({ label, days }) => {
      const gap = findContinuityGap(closesForGapCheck, dateAt(days), todayStr);
      const pct = gap ? null : pctChange(latestClose, closeAtOrBefore(dateAt(days)));
      return { label, pct, gap };
    });
    const perf = Object.fromEntries(perfEntries.map((e) => [e.label, e.pct]));
    const oneYearGap = perfEntries.find((e) => e.label === "۱ سال")?.gap ?? null;

    const { data: usdIrrRows } = await client.from("benchmark_candles").select("date, close").eq("asset", "usd_irr").order("date", { ascending: true }).limit(2000);
    const usdByDate = new Map((usdIrrRows ?? []).map((r) => [r.date as string, r.close as number]));
    const usdNow = usdByDate.get([...usdByDate.keys()].sort().slice(-1)[0]) ?? null;
    const usdOneYearAgo = usdByDate.get([...usdByDate.keys()].filter((d) => d <= dateAt(365)).sort().slice(-1)[0] ?? "") ?? null;
    const priceUsdNow = latestClose != null && usdNow ? latestClose / usdNow : null;
    const priceUsdOneYearAgo = closeAtOrBefore(dateAt(365)) != null && usdOneYearAgo ? closeAtOrBefore(dateAt(365))! / usdOneYearAgo : null;
    // همان بازهٔ یک‌سالهٔ بالا — اگر آنجا caveat خورده، این عدد هم از همان قیمت مبنا ساخته می‌شود
    const dollarPerf1y = oneYearGap ? null : pctChange(priceUsdNow, priceUsdOneYearAgo);

    const { data: industrySymbolsRaw } = await client.from("watchlist").select("symbol").eq("industry", industry);
    const industrySymbols = (industrySymbolsRaw ?? []).map((r) => r.symbol as string).filter((s) => s !== symbol);
    const industryCloses: DatedValue[][] = await Promise.all(
      industrySymbols.map(async (s) => {
        const c = await fetchCandles(client, s);
        return c.filter((r) => r.final_price != null).map((r) => ({ date: r.date as string, value: r.final_price as number }));
      }),
    );
    const industryIndex = buildEqualWeightIndex(industryCloses);
    const industryIndexStart = industryIndex.find((p) => p.date <= dateAt(365))?.value ?? industryIndex[0]?.value ?? null;
    const industryIndexEnd = industryIndex[industryIndex.length - 1]?.value ?? null;
    const industryPerf1y = pctChange(industryIndexEnd, industryIndexStart);

    const { data: tedpixRows } = await client.from("benchmark_candles").select("date, close").eq("asset", "tedpix").order("date", { ascending: true }).limit(2000);
    const tedpixByDate = new Map((tedpixRows ?? []).map((r) => [r.date as string, r.close as number]));
    const tedpixNow = tedpixByDate.get([...tedpixByDate.keys()].sort().slice(-1)[0] ?? "") ?? null;
    const tedpixOneYearAgo = tedpixByDate.get([...tedpixByDate.keys()].filter((d) => d <= dateAt(365)).sort().slice(-1)[0] ?? "") ?? null;
    const tedpixPerf1y = pctChange(tedpixNow, tedpixOneYearAgo);

    const CONTINUITY_CAVEAT = "توقف نماد/افزایش سرمایهٔ احتمالی در این بازه — بازدهی قابل‌اتکا نیست";
    dataSnapshot.price_performance = {
      ...perf,
      dollar_denominated_1y_pct: dollarPerf1y,
      industry_index_1y_pct: industryPerf1y,
      tedpix_1y_pct: tedpixPerf1y,
      continuity_gaps: perfEntries.filter((e) => e.gap != null).map((e) => ({ window: e.label, prevDate: e.gap!.prevDate, date: e.gap!.date, gapDays: e.gap!.gapDays })),
    };
    sections.push(
      renderReportSection(
        "۲. عملکرد قیمت (adjusted)",
        renderReportTable(
          [
            { header: "بازه", accessor: (r: (typeof perfEntries)[number]) => r.label },
            { header: "بازده", accessor: (r: (typeof perfEntries)[number]) => (r.gap ? CONTINUITY_CAVEAT : formatFaPercent(r.pct)) },
          ],
          perfEntries,
        ) +
          renderReportParagraph(
            // industryPerf1y/tedpixPerf1y بنچمارک مستقل‌اند (نه قیمت خودِ این نماد) — وقفهٔ
            // معاملاتی این نماد روی درستی آن‌ها اثر ندارد؛ فقط بخش دلاریِ متکی به قیمت خودِ
            // نماد caveat می‌گیرد.
            `بازده ۱سالهٔ نمای دلاری (قیمت÷دلار آزاد): ${oneYearGap ? CONTINUITY_CAVEAT : formatFaPercent(dollarPerf1y)} — در مقابل شاخص صنعت (ترکیب هم‌وزن رقبا): ${formatFaPercent(industryPerf1y)} و شاخص کل: ${formatFaPercent(tedpixPerf1y)}.`,
          ),
      ),
    );

    // ===== ۳. تابلوخوانی ۳۰ روز =====
    const since30dIso = new Date(nowMs - 30 * 24 * 60 * 60_000).toISOString();
    const { data: tabloo30d } = await client
      .from("tabloo_metrics")
      .select("metric, value, captured_at")
      .eq("symbol", symbol)
      .gte("captured_at", since30dIso)
      .order("captured_at", { ascending: true })
      .limit(2000);
    const buyerPowerSeries = (tabloo30d ?? []).filter((r) => r.metric === "buyer_power" && r.value != null);
    const moneyFlowSeries = (tabloo30d ?? []).filter((r) => r.metric === "money_flow" && r.value != null);
    const eventRows = (tabloo30d ?? []).filter((r) => ["suspicious_volume", "whale", "code_to_code"].includes(r.metric) && r.value === 1);
    dataSnapshot.tabloo_30d = {
      buyer_power_points: buyerPowerSeries.length,
      cumulative_money_flow: moneyFlowSeries.reduce((s, r) => s + (r.value ?? 0), 0),
      events: eventRows.map((r) => ({ metric: r.metric, date: r.captured_at })),
    };
    sections.push(
      renderReportSection(
        "۳. تابلوخوانی ۳۰ روز اخیر",
        renderLineChartSvg(buyerPowerSeries.map((r) => ({ x: formatJalaliDay(r.captured_at), y: r.value as number }))) +
          renderReportParagraph(`ورود پول تجمعی ۳۰ روز: ${formatFaCompactRial(moneyFlowSeries.reduce((s, r) => s + (r.value ?? 0), 0))}`) +
          renderReportTable(
            [
              { header: "رخداد", accessor: (r: { metric: string; captured_at: string }) => r.metric },
              { header: "تاریخ", accessor: (r: { metric: string; captured_at: string }) => formatJalaliDateTime(r.captured_at) },
            ],
            eventRows.slice(0, 20),
          ),
      ),
    );

    // ===== ۴. رفتار صف =====
    const queueRows = (tabloo30d ?? []).filter((r) => r.metric === "queue_locked_buy");
    const lockedDays = new Set(queueRows.filter((r) => r.value === 1).map((r) => r.captured_at.slice(0, 10))).size;
    dataSnapshot.queue_behavior = { locked_days: lockedDays, sample_days: new Set(queueRows.map((r) => r.captured_at.slice(0, 10))).size };
    sections.push(
      renderReportSection(
        "۴. رفتار صف",
        renderReportParagraph(
          `${formatFaNumber(lockedDays)} روز از ${formatFaNumber(new Set(queueRows.map((r) => r.captured_at.slice(0, 10))).size)} روز نمونه‌گیری‌شده در صف خرید قفل بوده.`,
        ),
      ),
    );

    // ===== ۵. تاریخچهٔ سیگنال =====
    const { data: signalsRaw } = await client
      .from("signals")
      .select("direction, score, created_at, signal_outcomes(return_1d, return_5d, return_20d)")
      .eq("symbol", symbol)
      .order("created_at", { ascending: false })
      .limit(50);
    const signalRows = (signalsRaw ?? []) as unknown as {
      direction: string;
      score: number;
      created_at: string;
      signal_outcomes: { return_1d: number | null; return_5d: number | null; return_20d: number | null } | { return_1d: number | null; return_5d: number | null; return_20d: number | null }[] | null;
    }[];
    interface SignalHistoryRow {
      direction: string;
      score: number;
      date: string;
      return_1d: number | null;
      return_5d: number | null;
      return_20d: number | null;
    }
    const signalHistory: SignalHistoryRow[] = signalRows.map((s) => {
      const o = Array.isArray(s.signal_outcomes) ? s.signal_outcomes[0] : s.signal_outcomes;
      return { direction: s.direction, score: s.score, date: s.created_at, return_1d: o?.return_1d ?? null, return_5d: o?.return_5d ?? null, return_20d: o?.return_20d ?? null };
    });
    dataSnapshot.signal_history = signalHistory;
    sections.push(
      renderReportSection(
        "۵. تاریخچهٔ سیگنال‌ها",
        renderReportTable<SignalHistoryRow>(
          [
            { header: "جهت", accessor: (r) => r.direction },
            { header: "score", accessor: (r) => formatFaNumber(r.score) },
            { header: "تاریخ", accessor: (r) => formatJalaliDateTime(r.date) },
            { header: "بازده ۵روزه", accessor: (r) => formatFaPercent(r.return_5d) },
          ],
          signalHistory,
        ),
      ),
    );

    // ===== ۶. همبستگی جهانی =====
    const symbolDaily: DatedValue[] = candles.filter((c) => c.final_price != null).map((c) => ({ date: c.date as string, value: c.final_price as number }));
    const [{ data: brentRows }, { data: goldRows }] = await Promise.all([
      client.from("global_quotes").select("price, captured_at").eq("asset", "brent").order("captured_at", { ascending: true }).limit(1000),
      client.from("global_quotes").select("price, captured_at").eq("asset", "gold_ounce").order("captured_at", { ascending: true }).limit(1000),
    ]);
    function toDailyFromQuotes(rows: { price: number | null; captured_at: string }[]): DatedValue[] {
      const byDay = new Map<string, number>();
      for (const r of rows) {
        if (r.price == null) continue;
        byDay.set(tehranDayBounds(new Date(r.captured_at)).date, r.price);
      }
      return [...byDay.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
    }
    function aligned(a: DatedValue[], b: DatedValue[]): [number[], number[]] {
      const bByDate = new Map(b.map((p) => [p.date, p.value]));
      const common = a.map((p) => p.date).filter((d) => bByDate.has(d)).sort();
      const aByDate = new Map(a.map((p) => [p.date, p.value]));
      return [logReturns(common.map((d) => aByDate.get(d)!)), logReturns(common.map((d) => bByDate.get(d)!))];
    }
    const drivers: { name: string; series: DatedValue[] }[] = [
      { name: "برنت", series: toDailyFromQuotes(brentRows ?? []) },
      { name: "دلار آزاد", series: (usdIrrRows ?? []).map((r) => ({ date: r.date as string, value: r.close as number })) },
      { name: "انس طلا", series: toDailyFromQuotes(goldRows ?? []) },
    ];
    const driverResults = drivers.map((d) => {
      const [leaderReturns, symbolReturns] = aligned(d.series, symbolDaily);
      if (leaderReturns.length < 40) return { driver: d.name, bestLag: null, correlation: null, n: leaderReturns.length };
      const ccf = crossCorrelation(leaderReturns, symbolReturns, 15);
      const best = bestLag(ccf);
      return { driver: d.name, bestLag: best?.lag ?? null, correlation: best?.correlation ?? null, n: leaderReturns.length };
    });
    dataSnapshot.global_correlation = driverResults;
    sections.push(
      renderReportSection(
        "۶. همبستگی با محرک‌های جهانی",
        renderReportTable(
          [
            { header: "محرک", accessor: (r: (typeof driverResults)[number]) => r.driver },
            { header: "لگ بهینه (روز)", accessor: (r: (typeof driverResults)[number]) => (r.bestLag == null ? "داده کافی نیست" : formatFaNumber(r.bestLag)) },
            { header: "همبستگی در آن لگ", accessor: (r: (typeof driverResults)[number]) => (r.correlation == null ? "—" : formatFaNumber(r.correlation, 2)) },
          ],
          driverResults,
        ),
      ),
    );

    // ===== ۷. فصلی‌نگری =====
    const seasonality = computeJalaliSeasonality(symbolDaily);
    dataSnapshot.seasonality = seasonality;
    sections.push(
      renderReportSection(
        "۷. فصلی‌نگری (میانگین بازده روزانه به تفکیک ماه شمسی، ۵ سال اخیر)",
        renderReportTable(
          [
            { header: "ماه", accessor: (r: (typeof seasonality)[number]) => r.monthName },
            { header: "میانگین بازده روزانه", accessor: (r: (typeof seasonality)[number]) => (r.avgReturnPct == null ? "داده کافی نیست" : formatFaPercent(r.avgReturnPct, 2)) },
            { header: "تعداد نمونه", accessor: (r: (typeof seasonality)[number]) => formatFaNumber(r.sampleSize) },
          ],
          seasonality,
        ),
      ),
    );

    // ===== ۸. جمع‌بندی LLM =====
    let summaryHtml = "";
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 1500,
            system: SYMBOL_SUMMARY_SYSTEM_PROMPT,
            messages: [{ role: "user", content: JSON.stringify(dataSnapshot) }],
          }),
        });
        if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
        const json = await res.json();
        const text = (json.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
        const parsed = parseWeeklySummaryResponse(text);
        if (parsed.success) {
          summaryHtml =
            renderReportParagraph(parsed.data.summary) +
            renderReportTable(
              [
                { header: "نکته", accessor: (r: (typeof parsed.data.key_points)[number]) => r.point },
                { header: "اطمینان", accessor: (r: (typeof parsed.data.key_points)[number]) => r.confidence },
                { header: "منبع", accessor: (r: (typeof parsed.data.key_points)[number]) => r.ref },
              ],
              parsed.data.key_points,
            );
        }
      } catch {
        // جمع‌بندی LLM عمداً حذف می‌شود، بقیهٔ گزارش سالم می‌ماند
      }
    }
    sections.push(
      renderReportSection(
        "۸. جمع‌بندی",
        (summaryHtml || renderReportParagraph("جمع‌بندی هوش مصنوعی در دسترس نیست — بقیهٔ گزارش مستقیم از داده است.")) +
          renderReportParagraph("این گزارش خروجی آماری است، نه توصیه سرمایه‌گذاری."),
      ),
    );

    const fullHtml = renderReportShell(
      `گزارش عمیق نماد ${symbol}`,
      `تولیدشده در ${formatJalaliDateTime(now.toISOString())}`,
      sections.join(""),
      "تولیدشده خودکار — داشبورد بازار بورس",
    );

    const { data: inserted, error: insertError } = await client
      .from("reports")
      .insert({ type: "symbol", period: `${symbol}_${todayStr}`, html: fullHtml, data_snapshot: dataSnapshot })
      .select("id")
      .single();
    if (insertError) throw insertError;

    return { ok: true, id: inserted?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
