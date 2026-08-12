import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { sendTelegramMessage } from "../_shared/telegram.ts";
import { tehranDayBounds } from "../../../lib/time/tehranDay.ts";
import { downsampleToDaily, type TimestampedValue } from "../../../lib/downsampleDaily.ts";
import { buildEqualWeightIndex, type DatedValue } from "../../../lib/syntheticIndex.ts";
import { detectCorrelationBreaks } from "../../../lib/correlationBreaks.ts";
import { logReturns } from "../../../lib/stats.ts";
import { computeRuleStats, type RuleStat, type RuleEvaluationLike } from "../../../lib/ruleStats.ts";
import { buildRuleReviewReport } from "../../../lib/ruleReview.ts";
import { computeRawScore, percentileRank } from "../../../lib/composite-rank.ts";
import { formatFaNumber, formatFaCompactRial, formatFaPercent } from "../../../lib/format.ts";
import { formatJalaliDay } from "../../../lib/jalali.ts";
import { renderReportShell, renderReportSection, renderReportTable, renderReportParagraph } from "../../../lib/reportHtml.ts";
import { renderBarChartSvg, renderLineChartSvg } from "../../../lib/reportCharts.ts";
import { parseWeeklySummaryResponse, type WeeklySummary } from "../../../lib/weeklyBriefSchema.ts";
import { buildVirtualPortfolioReport } from "../../../lib/virtualPortfolioReport.ts";
import { OUTCOME_LABEL_FA, summarizeLabels } from "../../../lib/outcomeLabels.ts";

/** برچسب فارسی وضعیت رکوردهای virtual_trades — همان نگاشت صفحهٔ /track-record. */
const VIRTUAL_STATUS_FA: Record<string, string> = {
  executed: "اجرا شد",
  partial: "اجرای جزئی (کمبود نقد)",
  pending_queue: "در انتظار صف",
  expired_queue: "منقضی به دلیل صف",
  rejected_liquidity: "رد: کمبود نقدینگی",
  rejected_max_positions: "رد: سقف پوزیشن",
  rejected_stale_data: "رد: دادهٔ کهنه/تعطیلی",
  closed: "بسته‌شده",
};

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://bazar-bourse.vercel.app";
const MODEL = "claude-sonnet-5";
const WEEK_DAYS = 7;
const REFINERY_SYMBOLS = ["شپنا", "شبندر", "شتران", "شبریز", "شسپا", "شراز"];
const METALS_SYMBOLS = ["فملی", "میدکو", "فایرا", "سیسکو", "هرمز", "ارفع", "کاوه", "آلومینا"];
const GLOBAL_WEEKLY_ASSETS: [asset: string, label: string][] = [
  ["brent", "نفت برنت"],
  ["gold_ounce", "انس طلا"],
  ["copper", "مس"],
  ["dxy", "DXY"],
  ["usd_irr", "دلار آزاد"],
  ["coin_emami", "سکه امامی"],
];

const SUMMARY_SYSTEM_PROMPT = `تو یک تحلیلگر ارشد بازار سرمایه ایران هستی که خلاصهٔ اجرایی یک گزارش هفتگی جامع بازار
را می‌نویسی. این خلاصه فقط یک بخش از گزارش بزرگ‌تر است؛ بقیهٔ بخش‌ها (جدول‌ها و اعداد) جدا و
مستقیم از دیتابیس تولید می‌شوند، کار تو فقط تفسیر همین ورودی JSON است.

## قواعد سخت — تخطی ممنوع
- هرگز عددی که در ورودی نیست نساز. داده‌ی غایب = صریح بنویس «داده موجود نیست».
- سیگنال جدید صادر نکن؛ فقط دربارهٔ داده‌های موجود اظهار نظر کن.
- اگر عملکرد موتور سیگنال این هفته ضعیف بود، صادقانه همین را بنویس — این گزارش ابزار
  حسابرسی خود سیستم هم هست، نه تبلیغ آن.
- هر ادعا باید سطح اطمینان داشته باشد: قطعی از داده / استنتاج قوی / گمانه، و به فیلد
  ورودی‌اش با ref ارجاع بدهد.
- از عبارات قطعی مثل «حتماً» استفاده نکن.

## خروجی — دقیقاً این JSON، به فارسی
{
  "summary": "۳-۵ جملهٔ تصویر کلان هفته",
  "key_points": [{"point":"...","confidence":"قطعی از داده | استنتاج قوی | گمانه","ref":"..."}]
}`;

type Client = ReturnType<typeof createServiceClient>;

function pctChange(current: number | null, prev: number | null): number | null {
  if (current == null || prev == null || prev === 0) return null;
  return Number((((current - prev) / prev) * 100).toFixed(2));
}

/**
 * ستون قیمت را به‌عنوان `value` برمی‌گرداند چون downsampleToDaily دقیقاً همین نام را
 * می‌خواند. قبلاً `price` خام برگردانده می‌شد و چون `row.value` همیشه undefined بود،
 * downsampleToDaily **هر ردیف را ساکت دور می‌ریخت** — یعنی نمودار تنش و تحلیل شکست
 * همبستگی برنت در گزارش هفتگی همیشه خالی تولید می‌شدند (باگ واقعی، کشف‌شده ۲۰۲۶-۰۸-۱۲).
 */
async function fetchGlobalWindow(client: Client, asset: string, sinceIso: string): Promise<TimestampedValue[]> {
  const { data } = await client
    .from("global_quotes")
    .select("price, captured_at")
    .eq("asset", asset)
    .gte("captured_at", sinceIso)
    .order("captured_at", { ascending: true })
    .limit(1000);
  return ((data ?? []) as { price: number | null; captured_at: string }[]).map((r) => ({
    value: r.price,
    captured_at: r.captured_at,
  }));
}

async function fetchSymbolCloses(client: Client, symbol: string, limit = 1300): Promise<DatedValue[]> {
  const { data } = await client
    .from("daily_candles")
    .select("date, final_price")
    .eq("symbol", symbol)
    .order("date", { ascending: false })
    .limit(limit);
  return (data ?? [])
    .filter((r) => r.final_price != null)
    .map((r) => ({ date: r.date as string, value: r.final_price as number }))
    .reverse();
}

Deno.serve(async () => {
  const start = performance.now();
  const client = createServiceClient();

  try {
    const now = new Date();
    const nowMs = now.getTime();
    const { date: todayStr } = tehranDayBounds(now);
    const weekStartIso = new Date(nowMs - WEEK_DAYS * 24 * 60 * 60_000).toISOString();
    const weekStartDate = tehranDayBounds(new Date(nowMs - WEEK_DAYS * 24 * 60 * 60_000)).date;
    const fourWeeksAgoIso = new Date(nowMs - 4 * WEEK_DAYS * 24 * 60 * 60_000).toISOString();
    const period = `${weekStartDate}..${todayStr}`;

    const dataSnapshot: Record<string, unknown> = { period, generated_at: now.toISOString() };
    const sections: string[] = [];

    // ===== ۲. بازار در یک نگاه =====
    const [{ data: tedpixWeek }, { data: tedpixEqWeek }] = await Promise.all([
      client.from("benchmark_candles").select("date, close").eq("asset", "tedpix").gte("date", weekStartDate).order("date", { ascending: true }),
      client.from("benchmark_candles").select("date, close").eq("asset", "tedpix_equal_weight").gte("date", weekStartDate).order("date", { ascending: true }),
    ]);
    const { data: tedpix4wAgoRows } = await client.from("benchmark_candles").select("close").eq("asset", "tedpix").lte("date", tehranDayBounds(new Date(nowMs - 4 * WEEK_DAYS * 24 * 60 * 60_000)).date).order("date", { ascending: false }).limit(1);

    const tedpixStart = tedpixWeek?.[0]?.close ?? null;
    const tedpixEnd = tedpixWeek?.[tedpixWeek.length - 1]?.close ?? null;
    const tedpixEqStart = tedpixEqWeek?.[0]?.close ?? null;
    const tedpixEqEnd = tedpixEqWeek?.[tedpixEqWeek.length - 1]?.close ?? null;
    const tedpix4wAgo = tedpix4wAgoRows?.[0]?.close ?? null;

    dataSnapshot.market_overview = {
      tedpix_start: tedpixStart,
      tedpix_end: tedpixEnd,
      tedpix_week_change_pct: pctChange(tedpixEnd, tedpixStart),
      tedpix_vs_4weeks_ago_pct: pctChange(tedpixEnd, tedpix4wAgo),
      tedpix_equal_weight_start: tedpixEqStart,
      tedpix_equal_weight_end: tedpixEqEnd,
      tedpix_equal_weight_week_change_pct: pctChange(tedpixEqEnd, tedpixEqStart),
    };
    sections.push(
      renderReportSection(
        "۱. بازار در یک نگاه",
        renderReportTable(
          [
            { header: "شاخص", accessor: (r: { label: string }) => r.label },
            { header: "ابتدای هفته", accessor: (r: { start: number | null }) => formatFaNumber(r.start) },
            { header: "پایان هفته", accessor: (r: { end: number | null }) => formatFaNumber(r.end) },
            { header: "تغییر هفته", accessor: (r: { changePct: number | null }) => formatFaPercent(r.changePct) },
          ],
          [
            { label: "شاخص کل", start: tedpixStart, end: tedpixEnd, changePct: pctChange(tedpixEnd, tedpixStart) },
            { label: "شاخص هم‌وزن", start: tedpixEqStart, end: tedpixEqEnd, changePct: pctChange(tedpixEqEnd, tedpixEqStart) },
          ],
        ) + renderReportParagraph(`نسبت به ۴ هفتهٔ قبل: ${formatFaPercent(pctChange(tedpixEnd, tedpix4wAgo))}`),
      ),
    );

    // ===== ۳. جریان پول =====
    const [{ data: watchlist }, { data: moneyFlowSymbolRaw }, { data: moneyFlowIndustryRaw }, { data: whaleRaw }, { data: codeToCodeRaw }] = await Promise.all([
      client.from("watchlist").select("symbol, industry"),
      client.from("tabloo_metrics").select("symbol, value, captured_at").eq("metric", "money_flow").gte("captured_at", weekStartIso),
      client.from("tabloo_metrics").select("symbol, value, captured_at").eq("metric", "money_flow_industry").gte("captured_at", weekStartIso),
      client.from("tabloo_metrics").select("symbol, value, captured_at").eq("metric", "whale").eq("value", 1).gte("captured_at", weekStartIso),
      client.from("tabloo_metrics").select("symbol, value, captured_at").eq("metric", "code_to_code").eq("value", 1).gte("captured_at", weekStartIso),
    ]);
    const moneyFlowBySymbol = new Map<string, number>();
    for (const row of moneyFlowSymbolRaw ?? []) {
      if (row.value == null) continue;
      moneyFlowBySymbol.set(row.symbol, (moneyFlowBySymbol.get(row.symbol) ?? 0) + row.value);
    }
    const moneyFlowByIndustryMap = new Map<string, number>();
    for (const row of moneyFlowIndustryRaw ?? []) {
      if (row.value == null) continue;
      moneyFlowByIndustryMap.set(row.symbol, (moneyFlowByIndustryMap.get(row.symbol) ?? 0) + row.value);
    }
    const sortedFlow = [...moneyFlowBySymbol.entries()].sort((a, b) => b[1] - a[1]);
    const top5In = sortedFlow.slice(0, 5);
    const top5Out = sortedFlow.slice(-5).reverse();
    const industryFlowSorted = [...moneyFlowByIndustryMap.entries()].sort((a, b) => b[1] - a[1]);

    dataSnapshot.money_flow = {
      top5_in: top5In.map(([symbol, value]) => ({ symbol, value })),
      top5_out: top5Out.map(([symbol, value]) => ({ symbol, value })),
      by_industry: industryFlowSorted.map(([industry, value]) => ({ industry, value })),
      whale_events: (whaleRaw ?? []).map((r) => ({ symbol: r.symbol, date: r.captured_at })),
      code_to_code_events: (codeToCodeRaw ?? []).map((r) => ({ symbol: r.symbol, date: r.captured_at })),
    };

    sections.push(
      renderReportSection(
        "۲. جریان پول",
        `<p class="report-paragraph">ورود/خروج پول حقیقی به تفکیک صنعت این هفته:</p>` +
          renderBarChartSvg(
            industryFlowSorted.map(([industry, value]) => ({ label: industry, value })),
            { valueFormatter: (v) => formatFaCompactRial(v) },
          ) +
          `<p class="report-paragraph">۵ نماد با بیشترین ورود پول:</p>` +
          renderReportTable(
            [
              { header: "نماد", accessor: (r: [string, number]) => r[0] },
              { header: "ورود پول", accessor: (r: [string, number]) => formatFaCompactRial(r[1]) },
            ],
            top5In,
          ) +
          `<p class="report-paragraph">۵ نماد با بیشترین خروج پول:</p>` +
          renderReportTable(
            [
              { header: "نماد", accessor: (r: [string, number]) => r[0] },
              { header: "خروج پول", accessor: (r: [string, number]) => formatFaCompactRial(r[1]) },
            ],
            top5Out,
          ) +
          renderReportParagraph(
            `پول درشت: ${(whaleRaw ?? []).length} رخداد. کد به کد: ${(codeToCodeRaw ?? []).length} رخداد این هفته.`,
          ),
      ),
    );

    // ===== ۴. زمینهٔ جهانی =====
    const globalHistories = await Promise.all(GLOBAL_WEEKLY_ASSETS.map(([asset]) => fetchGlobalWindow(client, asset, fourWeeksAgoIso)));
    const globalWeekly = GLOBAL_WEEKLY_ASSETS.map(([asset, label], i) => {
      const rows = globalHistories[i];
      const weekRows = rows.filter((r) => r.captured_at >= weekStartIso);
      // با فقط یک نقطهٔ داده در کل هفته (مثلا وقفهٔ جمع‌آوری)، «شروع» و «پایان» همان یک ردیف
      // می‌شود و تغییر ۰٪ گمراه‌کننده است — باید صریح «داده کافی نیست» باشد، نه ۰٪ واقعی.
      if (weekRows.length < 2) {
        return { asset, label, start: null, end: weekRows[0]?.value ?? rows[rows.length - 1]?.value ?? null, changePct: null };
      }
      const start = weekRows[0].value;
      const end = weekRows[weekRows.length - 1].value;
      return { asset, label, start, end, changePct: pctChange(end, start) };
    });
    dataSnapshot.global_weekly = globalWeekly;

    const [refineryCloses, metalsCloses, usdIrrDailyRows] = await Promise.all([
      Promise.all(REFINERY_SYMBOLS.map((s) => fetchSymbolCloses(client, s))),
      Promise.all(METALS_SYMBOLS.map((s) => fetchSymbolCloses(client, s))),
      client.from("benchmark_candles").select("date, close").eq("asset", "usd_irr").order("date", { ascending: false }).limit(120),
    ]);
    const refineryIndex = buildEqualWeightIndex(refineryCloses);
    const metalsIndex = buildEqualWeightIndex(metalsCloses);
    const usdIrrDaily: DatedValue[] = (usdIrrDailyRows.data ?? []).slice().reverse().map((r) => ({ date: r.date as string, value: r.close as number }));
    const brentDaily: DatedValue[] = downsampleToDaily(globalHistories[0]);

    function alignedReturns(a: DatedValue[], b: DatedValue[]): [number[], number[]] {
      const bByDate = new Map(b.map((p) => [p.date, p.value]));
      const common = a.map((p) => p.date).filter((d) => bByDate.has(d)).sort();
      const aByDate = new Map(a.map((p) => [p.date, p.value]));
      return [logReturns(common.map((d) => aByDate.get(d)!)), logReturns(common.map((d) => bByDate.get(d)!))];
    }
    const [usdMetalsA, usdMetalsB] = alignedReturns(usdIrrDaily, metalsIndex);
    const [brentRefineryA, brentRefineryB] = alignedReturns(brentDaily, refineryIndex);
    const correlationBreaks = detectCorrelationBreaks(
      [
        { label: "دلار آزاد × فلزات اساسی", seriesA: usdMetalsA, seriesB: usdMetalsB },
        { label: "برنت × پالایشی", seriesA: brentRefineryA, seriesB: brentRefineryB },
      ],
      30,
      0.4,
    );
    dataSnapshot.correlation_breaks = correlationBreaks;

    sections.push(
      renderReportSection(
        "۳. زمینهٔ جهانی",
        renderReportTable(
          [
            { header: "دارایی", accessor: (r: (typeof globalWeekly)[number]) => r.label },
            { header: "تغییر هفته", accessor: (r: (typeof globalWeekly)[number]) => formatFaPercent(r.changePct) },
          ],
          globalWeekly,
        ) +
          (correlationBreaks.length === 0
            ? renderReportParagraph("این هفته شکست همبستگی معناداری در جفت‌های زیر نظر ثبت نشد.")
            : renderReportTable(
                [
                  { header: "جفت", accessor: (r: (typeof correlationBreaks)[number]) => r.pairLabel },
                  { header: "همبستگی امروز", accessor: (r: (typeof correlationBreaks)[number]) => formatFaNumber(r.currentCorrelation, 2) },
                  { header: "میانگین تاریخی", accessor: (r: (typeof correlationBreaks)[number]) => formatFaNumber(r.historicalMeanCorrelation, 2) },
                ],
                correlationBreaks,
              )),
      ),
    );

    // ===== ۵. رژیم و تنش =====
    const tensionRows = await fetchGlobalWindow(client, "tension_index", weekStartIso);
    const tensionDaily = downsampleToDaily(tensionRows);
    const { data: regimeSetting } = await client.from("settings").select("value").eq("key", "market_regime").maybeSingle();
    const currentRegime = (regimeSetting?.value as string | undefined) ?? "normal";
    const { data: newsWeek } = await client.from("news_items").select("title, source, published_at").gte("published_at", weekStartIso).order("published_at", { ascending: false }).limit(50);

    dataSnapshot.regime_and_tension = { current_regime: currentRegime, tension_series: tensionDaily, news_count: (newsWeek ?? []).length };

    sections.push(
      renderReportSection(
        "۴. رژیم و تنش",
        renderReportParagraph(`رژیم فعلی بازار: ${currentRegime} (تاریخچهٔ تغییرات این هفته ثبت نمی‌شود، فقط مقدار لحظهٔ گزارش).`) +
          renderLineChartSvg(tensionDaily.map((p) => ({ x: formatJalaliDay(p.date + "T00:00:00Z"), y: p.value }))) +
          `<p class="report-paragraph">تیترهای هفته (${(newsWeek ?? []).length} خبر):</p>` +
          renderReportTable(
            [
              { header: "عنوان", accessor: (r: { title: string }) => r.title },
              { header: "منبع", accessor: (r: { source: string }) => r.source },
            ],
            (newsWeek ?? []).slice(0, 15),
          ),
      ),
    );

    // ===== ۶. کارنامهٔ موتور سیگنال =====
    async function ruleStatsForWindow(sinceIso: string, untilIso: string): Promise<RuleStat[]> {
      const { data } = await client
        .from("signals")
        .select("score, reasons, signal_outcomes(return_5d)")
        .gte("created_at", sinceIso)
        .lt("created_at", untilIso)
        .limit(1000);
      const rows = (data ?? []) as unknown as { reasons: { rule: string; triggered: boolean }[]; signal_outcomes: { return_5d: number | null } | { return_5d: number | null }[] | null }[];
      const evaluated = rows
        .map((r) => {
          const outcome = Array.isArray(r.signal_outcomes) ? r.signal_outcomes[0] : r.signal_outcomes;
          return { reasons: r.reasons ?? [], returnPct: outcome?.return_5d ?? null };
        })
        .filter((r) => r.returnPct != null);
      return computeRuleStats(evaluated);
    }

    const thisWeekStats = await ruleStatsForWindow(weekStartIso, now.toISOString());
    const lastWeekStart = new Date(nowMs - 2 * WEEK_DAYS * 24 * 60 * 60_000).toISOString();
    const lastWeekStats = await ruleStatsForWindow(lastWeekStart, weekStartIso);
    dataSnapshot.signal_track_record = { this_week: thisWeekStats, last_week: lastWeekStats };

    sections.push(
      renderReportSection(
        "۵. کارنامهٔ موتور سیگنال",
        renderReportParagraph("عملکرد هر قانون بر اساس بازده ۵روزهٔ سیگنال‌های evaluate‌شدهٔ این هفته (صادقانه، بدون آرایش):") +
          renderReportTable(
            [
              { header: "قانون", accessor: (r: RuleStat) => r.rule },
              { header: "تعداد", accessor: (r: RuleStat) => formatFaNumber(r.count) },
              { header: "win rate", accessor: (r: RuleStat) => formatFaPercent(r.winRate, 1) },
              { header: "profit factor", accessor: (r: RuleStat) => (r.profitFactor == null ? "—" : formatFaNumber(r.profitFactor, 2)) },
            ],
            thisWeekStats,
          ) +
          renderReportParagraph(
            thisWeekStats.length === 0 && lastWeekStats.length === 0
              ? "این هفته و هفتهٔ قبل هیچ سیگنالی evaluate نشده — کارنامه‌ای برای مقایسه نیست."
              : `هفتهٔ قبل ${lastWeekStats.reduce((s, r) => s + r.count, 0)} evaluate‌شده در برابر ${thisWeekStats.reduce((s, r) => s + r.count, 0)} این هفته.`,
          ),
      ),
    );

    // ===== ۵ب. پرتفوی مجازی خودکار (قانون #۱۴ — فقط گزارش، بدون هیچ اثر برگشتی) =====
    const vp = await buildVirtualPortfolioReport(client);
    const weekTrades = vp.allTrades.filter((t) => t.signal_at >= weekStartIso);
    const weekStatusCounts: Record<string, number> = {};
    for (const t of weekTrades) weekStatusCounts[t.status] = (weekStatusCounts[t.status] ?? 0) + 1;

    // معاملاتی که همین هفته بسته شدند (بر اساس id رکورد، نه تطبیق نماد — یک نماد می‌تواند
    // چند رکورد داشته باشد و تطبیق با نماد رکورد اشتباه را برمی‌داشت).
    const weekClosedRows = vp.allTrades.filter((t) => t.status === "closed" && (t.exit_at ?? "") >= weekStartIso);
    const weekReturns = weekClosedRows.map((t) => Number(t.return_pct ?? 0));
    const weekAvgReturnPct =
      weekReturns.length > 0 ? weekReturns.reduce((a, b) => a + b, 0) / weekReturns.length : null;
    const weekLabelCounts = summarizeLabels(
      weekClosedRows.map((t) => vp.outcomeLabels.get(t.id)!.label),
    );

    const ruleReview = buildRuleReviewReport(
      vp.allTrades.map((t) => ({
        reasons: Array.isArray(t.signal_reasons) ? (t.signal_reasons as RuleEvaluationLike[]) : [],
        returnPct: t.return_pct == null ? null : Number(t.return_pct),
        label: vp.outcomeLabels.get(t.id)?.label ?? null,
      })),
      now.toISOString(),
    );
    dataSnapshot.rule_review = ruleReview;

    dataSnapshot.virtual_portfolio = {
      signals_this_week: weekTrades.length,
      status_counts_this_week: weekStatusCounts,
      closed_this_week: weekClosedRows.length,
      total_return_pct_since_start: vp.metrics.totalReturnPct,
      win_rate_pct: vp.metrics.sampleAdequate ? vp.metrics.winRatePct : null,
      sample_adequate: vp.metrics.sampleAdequate,
      benchmarks: vp.benchmarkComparison,
      label_counts_all_time: vp.labelCounts,
      caveats: vp.metrics.notes,
    };

    const virtualIntro = renderReportParagraph(
      "سیستم سیگنال‌های خودش را با بودجهٔ فرضی اجرا می‌کند تا عملکردشان قابل راستی‌آزمایی باشد. " +
        "نتایج این بخش هرگز به‌صورت خودکار وزن یا آستانهٔ سیگنال‌ها را تغییر نمی‌دهند.",
    );

    // حالت خالی صریح: تا وقتی هیچ رکوردی ثبت نشده، جدول‌های پر از صفر ساخته نمی‌شوند —
    // «۰ معامله با بازده ۰٪» با «هنوز شروع نشده» یکی نیست و نباید شبیه هم دیده شوند.
    sections.push(
      vp.allTrades.length === 0
        ? renderReportSection(
            "۶. پرتفوی مجازی خودکار",
            virtualIntro +
              renderReportParagraph(
                "هنوز هیچ سیگنالی در پرتفوی مجازی ثبت نشده، پس عددی برای گزارش نیست. " +
                  "موتور اجرا در ساعات بازار هر ۱۰ دقیقه سیگنال‌های تازه را برمی‌دارد؛ اولین رکوردها بعد از " +
                  "نخستین جلسهٔ معاملاتی که سیگنال داشته باشد ظاهر می‌شوند. این وضعیت خطا نیست.",
              ),
          )
        : renderReportSection(
        "۶. پرتفوی مجازی خودکار",
        virtualIntro +
          renderReportTable(
            [
              { header: "معیار", accessor: (r: { k: string; v: string }) => r.k },
              { header: "مقدار", accessor: (r: { k: string; v: string }) => r.v },
            ],
            [
              { k: "سیگنال این هفته", v: formatFaNumber(weekTrades.length) },
              ...Object.entries(weekStatusCounts).map(([status, count]) => ({
                k: `— ${VIRTUAL_STATUS_FA[status] ?? status}`,
                v: formatFaNumber(count),
              })),
              { k: "معاملهٔ بسته‌شده این هفته", v: formatFaNumber(weekClosedRows.length) },
              { k: "میانگین بازده معاملات بستهٔ این هفته", v: weekAvgReturnPct == null ? "—" : formatFaPercent(weekAvgReturnPct, 2) },
              { k: "بازده از ابتدا", v: vp.metrics.totalReturnPct == null ? "هنوز پوزیشنی باز نشده" : formatFaPercent(vp.metrics.totalReturnPct, 2) },
              { k: "نرخ برد (از ابتدا)", v: vp.metrics.sampleAdequate ? formatFaPercent(vp.metrics.winRatePct, 1) : "دادهٔ کافی نیست" },
            ],
          ) +
          renderReportTable(
            [
              { header: "بنچمارک", accessor: (r: { label: string }) => r.label },
              { header: "بازده بنچمارک", accessor: (r: { benchmarkReturnPct: number | null }) => (r.benchmarkReturnPct == null ? "دادهٔ موجود نیست" : formatFaPercent(r.benchmarkReturnPct, 2)) },
              { header: "مازاد پرتفوی", accessor: (r: { excessPct: number | null }) => (r.excessPct == null ? "—" : formatFaPercent(r.excessPct, 2)) },
            ],
            vp.benchmarkComparison,
          ) +
          renderReportTable(
            [
              { header: "برچسب علت (این هفته)", accessor: (r: { k: string; v: string }) => r.k },
              { header: "تعداد", accessor: (r: { k: string; v: string }) => r.v },
            ],
            (Object.keys(OUTCOME_LABEL_FA) as (keyof typeof OUTCOME_LABEL_FA)[]).map((key) => ({
              k: OUTCOME_LABEL_FA[key],
              v: formatFaNumber(weekLabelCounts[key]),
            })),
          ) +
          (vp.metrics.notes.length > 0
            ? renderReportParagraph("محدودیت آماری: " + vp.metrics.notes.join(" "))
            : "") +
          // بخش ۶ پرامپت — بازبینی انسان-در-حلقه. فقط پیشنهاد؛ هیچ تغییری اعمال نمی‌شود (قید #۱۴).
          renderReportParagraph(ruleReview.disclaimer) +
          renderReportTable(
            [
              { header: "قانون", accessor: (r: (typeof ruleReview.rows)[number]) => r.rule },
              { header: "حضور", accessor: (r: (typeof ruleReview.rows)[number]) => formatFaNumber(r.count) },
              {
                header: "نرخ برد",
                accessor: (r: (typeof ruleReview.rows)[number]) =>
                  r.adequateSample && r.winRate != null ? formatFaPercent(r.winRate, 1) : "—",
              },
              { header: "پیشنهاد برای بررسی انسانی", accessor: (r: (typeof ruleReview.rows)[number]) => r.suggestion },
            ],
            ruleReview.rows,
          ),
          ),
    );

    // ===== ۷. هفتهٔ پیش رو =====
    const nextWeekEndIso = new Date(nowMs + 7 * 24 * 60 * 60_000).toISOString();
    const { data: upcomingHolidays } = await client.from("market_holidays").select("date, title").gte("date", todayStr).lte("date", tehranDayBounds(new Date(nextWeekEndIso)).date).order("date", { ascending: true });
    dataSnapshot.week_ahead = { holidays: upcomingHolidays ?? [] };
    sections.push(
      renderReportSection(
        "۷. هفتهٔ پیش رو",
        renderReportTable(
          [
            { header: "تاریخ", accessor: (r: { date: string }) => formatJalaliDay(r.date + "T00:00:00Z") },
            { header: "عنوان", accessor: (r: { title: string }) => r.title },
          ],
          upcomingHolidays ?? [],
        ) + renderReportParagraph("رویدادهای تقویمی مجامع (Codal) در سیستم موجود نیست."),
      ),
    );

    // ===== ۸. رتبه‌بندی نمادها =====
    const allCloses = await Promise.all((watchlist ?? []).map((w) => fetchSymbolCloses(client, w.symbol as string)));
    const currentRanks = percentileRank((watchlist ?? []).map((w, i) => ({ symbol: w.symbol as string, rawScore: computeRawScore(allCloses[i].map((c) => c.value)).rawScore })));
    const priorCloses = allCloses.map((closes) => closes.filter((c) => c.date < weekStartDate));
    const priorRanks = percentileRank((watchlist ?? []).map((w, i) => ({ symbol: w.symbol as string, rawScore: computeRawScore(priorCloses[i].map((c) => c.value)).rawScore })));
    const priorRankBySymbol = new Map(priorRanks.map((r) => [r.symbol, r.rank]));
    const rankingRows = currentRanks
      .map((r) => ({ symbol: r.symbol, rank: r.rank, priorRank: priorRankBySymbol.get(r.symbol) ?? null }))
      .sort((a, b) => b.rank - a.rank);
    dataSnapshot.composite_ranking = rankingRows;

    sections.push(
      renderReportSection(
        "۸. رتبه‌بندی نمادهای واچ‌لیست",
        renderReportTable(
          [
            { header: "نماد", accessor: (r: (typeof rankingRows)[number]) => r.symbol },
            { header: "رتبهٔ مرکب", accessor: (r: (typeof rankingRows)[number]) => formatFaNumber(r.rank) },
            {
              header: "تغییر نسبت به هفتهٔ قبل",
              accessor: (r: (typeof rankingRows)[number]) => (r.priorRank == null ? "—" : formatFaNumber(r.rank - r.priorRank, 0)),
            },
          ],
          rankingRows.slice(0, 20),
        ),
      ),
    );

    // ===== ۱. خلاصهٔ اجرایی (LLM) — اگر شکست خورد، بدون کرش بقیهٔ گزارش سالم می‌ماند =====
    let summaryHtml = "";
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (apiKey) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 1500,
            system: SUMMARY_SYSTEM_PROMPT,
            messages: [{ role: "user", content: JSON.stringify(dataSnapshot) }],
          }),
        });
        if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
        const json = await res.json();
        const text = (json.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
        const parsed = parseWeeklySummaryResponse(text);
        if (parsed.success) {
          const summary: WeeklySummary = parsed.data;
          summaryHtml = renderReportParagraph(summary.summary) +
            renderReportTable(
              [
                { header: "نکته", accessor: (r: WeeklySummary["key_points"][number]) => r.point },
                { header: "اطمینان", accessor: (r: WeeklySummary["key_points"][number]) => r.confidence },
                { header: "منبع", accessor: (r: WeeklySummary["key_points"][number]) => r.ref },
              ],
              summary.key_points,
            );
        }
      } catch {
        // خلاصهٔ اجرایی عمداً حذف می‌شود، بقیهٔ گزارش سالم می‌ماند — طبق قید صریح پرامپت فاز ۷
      }
    }
    const summarySection = renderReportSection(
      "خلاصهٔ اجرایی",
      summaryHtml || renderReportParagraph("خلاصهٔ اجرایی این هفته در دسترس نیست (بدون هوش مصنوعی) — بقیهٔ گزارش کامل و مستقیم از داده است."),
    );

    // ===== ساخت و ذخیرهٔ گزارش =====
    const fullHtml = renderReportShell(
      "گزارش هفتگی جامع بازار",
      `بازهٔ ${formatJalaliDay(weekStartDate + "T00:00:00Z")} تا ${formatJalaliDay(todayStr + "T00:00:00Z")}`,
      summarySection + sections.join(""),
      "تولیدشده خودکار — داشبورد بازار بورس",
    );

    const { data: inserted, error: insertError } = await client
      .from("reports")
      .insert({ type: "weekly", period, html: fullHtml, data_snapshot: dataSnapshot })
      .select("id")
      .single();
    if (insertError) throw insertError;

    await sendTelegramMessage(`📄 گزارش هفتگی جدید آماده شد\n${period}\n${SITE_URL}/reports`);

    const latencyMs = Math.round(performance.now() - start);
    await logHealth(client, "weekly-report", "ok", `report id=${inserted?.id}`, latencyMs);

    return new Response(JSON.stringify({ ok: true, id: inserted?.id }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    await logHealth(client, "weekly-report", "error", message, latencyMs);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
