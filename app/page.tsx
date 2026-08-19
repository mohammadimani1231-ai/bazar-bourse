import { createServerSupabaseClient } from "@/lib/supabase/serverClient.ts";
import { tehranDayBounds } from "@/lib/time/tehranDay.ts";
import { toToman } from "@/lib/format.ts";
import { isMarketOpen } from "@/lib/market-status.ts";
import { GlobalTickerBar, type TickerItem } from "@/components/GlobalTickerBar";
import { IndexSummary } from "@/components/IndexSummary";
import { MarketTreemap, type TreemapItem } from "@/components/MarketTreemap";
import { IndustryRanking, type IndustryFlow } from "@/components/IndustryRanking";
import { RegimeSwitch } from "@/components/RegimeSwitch";
import { TensionGauge } from "@/components/TensionGauge";
import { NewsFeed, type NewsItem } from "@/components/NewsFeed";
import { AiBriefCard, type LatestBrief } from "@/components/AiBriefCard";
import type { MarketRegime } from "@/lib/marketRegime.ts";

// دیتای زنده (قیمت/پول/سیگنال) — نباید در build-time prerender و freeze شود
export const dynamic = "force-dynamic";

const GLOBAL_ASSET_LABELS: Record<string, string> = {
  brent: "نفت برنت",
  gold_ounce: "انس طلا",
  copper: "مس",
  dxy: "شاخص دلار (DXY)",
  sp500: "S&P 500",
  usd_irr: "دلار آزاد",
  gold_18k: "طلای ۱۸ عیار",
  coin_emami: "سکه امامی",
};
const GLOBAL_ASSET_ORDER = Object.keys(GLOBAL_ASSET_LABELS);

// باید دقیقاً با REFERENCE_SYMBOL در supabase/functions/_shared/marketStatus.ts یکی بماند —
// آن فایل Deno-specific است (npm: specifier) و مستقیم در Next.js قابل import نیست، پس منطق
// خالص isMarketOpen از lib/market-status.ts دوباره‌استفاده می‌شود، فقط orchestration کوئری تکرار شده.
const MARKET_STATUS_REFERENCE_SYMBOL = "فملی";

function latestByKey<T extends Record<string, unknown>>(rows: T[], key: keyof T): T[] {
  const seen = new Set<unknown>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row[key])) continue;
    seen.add(row[key]);
    out.push(row);
  }
  return out;
}

export default async function OverviewPage() {
  const supabase = createServerSupabaseClient();
  const today = tehranDayBounds(new Date()).date;

  const [
    { data: globalQuotesRaw },
    { data: marketIndexRows },
    { data: watchlist },
    { data: quotesRaw },
    { data: prevCandlesRaw },
    { data: moneyFlowRaw },
    { data: tensionRows },
    { data: regimeSetting },
    { data: newsRaw },
    { data: latestBriefRaw },
    { data: holidayRows },
    { data: indexHistoryRaw },
  ] = await Promise.all([
    supabase.from("global_quotes").select("asset, price, change_pct, captured_at").order("captured_at", { ascending: false }).limit(120),
    // منبع زندهٔ شاخص کل/هم‌وزن/ارزش کل بازار (اصلاح incident collect-tse) — نه benchmark_candles
    // که تنها نویسنده‌اش یک اسکریپت پایتون یک‌بارمصرف بود، رجوع به CLAUDE.md.
    supabase
      .from("market_index_quotes")
      .select("index_value, index_change, index_equal_weight, index_equal_weight_change, total_trade_value, captured_at")
      .order("captured_at", { ascending: false })
      .limit(1),
    supabase.from("watchlist").select("symbol, industry"),
    supabase.from("quotes").select("symbol, last_price, close_price, value, volume, captured_at").order("captured_at", { ascending: false }).limit(200),
    supabase.from("daily_candles").select("symbol, date, final_price").lt("date", today).order("date", { ascending: false }).limit(200),
    supabase.from("tabloo_metrics").select("symbol, value, captured_at").eq("metric", "money_flow").order("captured_at", { ascending: false }).limit(200),
    supabase.from("global_quotes").select("price, captured_at").eq("asset", "tension_index").order("captured_at", { ascending: false }).limit(1),
    supabase.from("settings").select("value").eq("key", "market_regime").maybeSingle(),
    supabase.from("news_items").select("id, title, source, url, matched_keywords, published_at").order("published_at", { ascending: false }).limit(15),
    supabase.from("ai_briefs").select("brief, input_snapshot, created_at").order("created_at", { ascending: false }).limit(1),
    supabase.from("market_holidays").select("date"),
    // ~۲۰ روز معاملاتی آخر هر دو شاخص، فقط برای sparkline پس‌زمینهٔ کارت (بازبینی مراجع
    // جهانی ۲۰۲۶-۰۸-۱۲) — از benchmark_candles که build-candles هر شب زنده پر می‌کند.
    supabase
      .from("benchmark_candles")
      .select("asset, date, close")
      .in("asset", ["tedpix", "tedpix_equal_weight"])
      .order("date", { ascending: false })
      .limit(40),
  ]);

  const globalQuotesLatest = latestByKey(globalQuotesRaw ?? [], "asset");
  const globalByAsset = new Map(globalQuotesLatest.map((r) => [r.asset, r]));
  const tickerItems: TickerItem[] = GLOBAL_ASSET_ORDER.map((asset) => {
    const row = globalByAsset.get(asset);
    return {
      asset,
      label: GLOBAL_ASSET_LABELS[asset],
      price: row?.price ?? null,
      changePct: row?.change_pct ?? null,
      capturedAt: row?.captured_at ?? null,
    };
  });

  // BrsApi خودش change مطلق را می‌دهد (نسبت به قیمت پایانی روز قبل)؛ درصدش را این‌طور می‌سازیم:
  // مقدار قبلی = فعلی − change، درصد = change / مقدار قبلی.
  function pctFromAbsoluteChange(current: number | null, change: number | null): number | null {
    if (current == null || change == null) return null;
    const previous = current - change;
    return previous === 0 ? null : (change / previous) * 100;
  }

  // خودِ کوئری نزولی بود (برای limit روی جدیدترین‌ها)، اینجا برای sparkline صعودی زمانی می‌شود.
  const indexHistoryAscending = [...(indexHistoryRaw ?? [])].reverse();
  const tedpixHistory = indexHistoryAscending.filter((r) => r.asset === "tedpix").map((r) => r.close as number | null);
  const tedpixEqualWeightHistory = indexHistoryAscending
    .filter((r) => r.asset === "tedpix_equal_weight")
    .map((r) => r.close as number | null);

  const marketIndexLatest = marketIndexRows?.[0] ?? null;
  const tedpixChangePct = pctFromAbsoluteChange(marketIndexLatest?.index_value ?? null, marketIndexLatest?.index_change ?? null);
  const tedpixEqualWeightChangePct = pctFromAbsoluteChange(
    marketIndexLatest?.index_equal_weight ?? null,
    marketIndexLatest?.index_equal_weight_change ?? null,
  );

  const quotesLatest = latestByKey(quotesRaw ?? [], "symbol");
  const quotesBySymbol = new Map(quotesLatest.map((r) => [r.symbol, r]));

  // وضعیت واقعی بازار (قید #۱۱ CLAUDE.md) — برای رنگ هشدار AsOfBadge روی هر سه کارت زیر.
  const holidayDates = new Set((holidayRows ?? []).map((r) => r.date as string));
  const referenceRecentVolumes = (quotesRaw ?? [])
    .filter((r) => r.symbol === MARKET_STATUS_REFERENCE_SYMBOL)
    .map((r) => ({ capturedAt: r.captured_at as string, volume: r.volume as number | null }));
  const marketStatus = isMarketOpen({ nowUtc: new Date(), holidayDates, recentVolumes: referenceRecentVolumes });
  const marketOpen = marketStatus.open;

  const prevCandlesLatest = latestByKey(prevCandlesRaw ?? [], "symbol");
  const prevCloseBySymbol = new Map(prevCandlesLatest.map((r) => [r.symbol, r.final_price]));

  const moneyFlowLatest = latestByKey(moneyFlowRaw ?? [], "symbol");
  const moneyFlowBySymbol = new Map(moneyFlowLatest.map((r) => [r.symbol, r.value]));

  const treemapItems: TreemapItem[] = (watchlist ?? [])
    .map((w) => {
      const q = quotesBySymbol.get(w.symbol);
      if (!q || !q.value) return null;
      const prevClose = prevCloseBySymbol.get(w.symbol) ?? null;
      const changePct =
        prevClose && q.last_price ? ((q.last_price - prevClose) / prevClose) * 100 : null;
      const item: TreemapItem = {
        symbol: w.symbol,
        industry: w.industry ?? "سایر",
        tradeValue: q.value,
        moneyFlow: moneyFlowBySymbol.get(w.symbol) ?? null,
        changePct,
      };
      return item;
    })
    .filter((x): x is TreemapItem => x !== null);

  // ارزش کل معاملات واقعی بازار (کل بورس، نه فقط ۴۵ نماد واچ‌لیست) — از همان تیک زندهٔ شاخص.
  const totalMarketValue = toToman(marketIndexLatest?.total_trade_value ?? null);
  const marketIndexCapturedAt = marketIndexLatest?.captured_at ?? null;

  const industryFlowMap = new Map<string, number>();
  for (const item of treemapItems) {
    if (item.moneyFlow == null) continue;
    industryFlowMap.set(item.industry, (industryFlowMap.get(item.industry) ?? 0) + item.moneyFlow);
  }
  const industryFlows: IndustryFlow[] = [...industryFlowMap.entries()].map(([industry, moneyFlow]) => ({
    industry,
    moneyFlow,
  }));

  const tensionLatest = tensionRows?.[0] ?? null;
  const regime = ((regimeSetting?.value as MarketRegime | undefined) ?? "normal") as MarketRegime;
  const newsItems: NewsItem[] = (newsRaw ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    source: n.source,
    url: n.url,
    matchedKeywords: n.matched_keywords ?? [],
    publishedAt: n.published_at,
  }));

  const latestBriefRow = latestBriefRaw?.[0] ?? null;
  const latestBrief: LatestBrief | null = latestBriefRow
    ? { brief: latestBriefRow.brief, inputSnapshot: latestBriefRow.input_snapshot, createdAt: latestBriefRow.created_at }
    : null;

  return (
    <div className="flex flex-col gap-4">
      <GlobalTickerBar items={tickerItems} />
      <IndexSummary
        tedpix={marketIndexLatest?.index_value ?? null}
        tedpixChangePct={tedpixChangePct}
        tedpixDate={marketIndexCapturedAt}
        tedpixHistory={tedpixHistory}
        tedpixEqualWeight={marketIndexLatest?.index_equal_weight ?? null}
        tedpixEqualWeightChangePct={tedpixEqualWeightChangePct}
        tedpixEqualWeightDate={marketIndexCapturedAt}
        tedpixEqualWeightHistory={tedpixEqualWeightHistory}
        totalMarketValue={totalMarketValue}
        totalMarketValueCapturedAt={marketIndexCapturedAt}
        marketOpen={marketOpen}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <MarketTreemap items={treemapItems} />
          <NewsFeed items={newsItems} />
        </div>
        <div className="flex flex-col gap-4">
          <IndustryRanking items={industryFlows} />
          <TensionGauge value={tensionLatest?.price ?? null} capturedAt={tensionLatest?.captured_at ?? null} />
          <RegimeSwitch current={regime} />
          <AiBriefCard latest={latestBrief} />
        </div>
      </div>
    </div>
  );
}
