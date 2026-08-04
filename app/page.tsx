import { createServerSupabaseClient } from "@/lib/supabase/serverClient.ts";
import { tehranDayBounds } from "@/lib/time/tehranDay.ts";
import { GlobalTickerBar, type TickerItem } from "@/components/GlobalTickerBar";
import { IndexSummary } from "@/components/IndexSummary";
import { MarketTreemap, type TreemapItem } from "@/components/MarketTreemap";
import { IndustryRanking, type IndustryFlow } from "@/components/IndustryRanking";
import { RegimeSwitch } from "@/components/RegimeSwitch";
import { TensionGauge } from "@/components/TensionGauge";
import { NewsFeed, type NewsItem } from "@/components/NewsFeed";
import { AiBriefCard } from "@/components/AiBriefCard";
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
    { data: tedpixRows },
    { data: watchlist },
    { data: quotesRaw },
    { data: prevCandlesRaw },
    { data: moneyFlowRaw },
    { data: tensionRows },
    { data: regimeSetting },
    { data: newsRaw },
  ] = await Promise.all([
    supabase.from("global_quotes").select("asset, price, change_pct, captured_at").order("captured_at", { ascending: false }).limit(120),
    supabase.from("benchmark_candles").select("date, close").eq("asset", "tedpix").order("date", { ascending: false }).limit(2),
    supabase.from("watchlist").select("symbol, industry"),
    supabase.from("quotes").select("symbol, last_price, close_price, value, captured_at").order("captured_at", { ascending: false }).limit(200),
    supabase.from("daily_candles").select("symbol, date, final_price").lt("date", today).order("date", { ascending: false }).limit(200),
    supabase.from("tabloo_metrics").select("symbol, value, captured_at").eq("metric", "money_flow").order("captured_at", { ascending: false }).limit(200),
    supabase.from("global_quotes").select("price, captured_at").eq("asset", "tension_index").order("captured_at", { ascending: false }).limit(1),
    supabase.from("settings").select("value").eq("key", "market_regime").maybeSingle(),
    supabase.from("news_items").select("id, title, source, url, matched_keywords, published_at").order("published_at", { ascending: false }).limit(15),
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

  const tedpixLatest = tedpixRows?.[0] ?? null;
  const tedpixPrev = tedpixRows?.[1] ?? null;
  const tedpixChangePct =
    tedpixLatest?.close != null && tedpixPrev?.close
      ? ((tedpixLatest.close - tedpixPrev.close) / tedpixPrev.close) * 100
      : null;

  const quotesLatest = latestByKey(quotesRaw ?? [], "symbol");
  const quotesBySymbol = new Map(quotesLatest.map((r) => [r.symbol, r]));

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

  const totalMarketValue = treemapItems.reduce((sum, i) => sum + i.tradeValue, 0) || null;

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

  return (
    <div className="flex flex-col gap-4">
      <GlobalTickerBar items={tickerItems} />
      <IndexSummary
        tedpix={tedpixLatest?.close ?? null}
        tedpixChangePct={tedpixChangePct}
        totalMarketValue={totalMarketValue}
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
          <AiBriefCard />
        </div>
      </div>
    </div>
  );
}
