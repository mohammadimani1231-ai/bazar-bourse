import { createServerSupabaseClient } from "@/lib/supabase/serverClient.ts";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages.ts";
import { downsampleToDaily } from "@/lib/downsampleDaily.ts";
import { buildEqualWeightIndex, type DatedValue } from "@/lib/syntheticIndex.ts";
import { crossCorrelation, bestLag } from "@/lib/stats.ts";
import { RebaseChart, type SeriesInput, type NewsMarkerInput } from "@/components/RebaseChart";
import { CorrelationHeatmap, type AssetSeries } from "@/components/CorrelationHeatmap";
import { LeadLagPanel, type LeadLagPair } from "@/components/LeadLagPanel";

// دیتای زنده (قیمت/پول/سیگنال) — نباید در build-time prerender و freeze شود
export const dynamic = "force-dynamic";

const REFINERY_SYMBOLS = ["شپنا", "شبندر", "شتران", "شبریز", "شسپا", "شراز"];
const METALS_SYMBOLS = ["فملی", "میدکو", "فایرا", "سیسکو", "هرمز", "ارفع", "کاوه", "آلومینا"];

async function fetchSymbolCloses(supabase: ReturnType<typeof createServerSupabaseClient>, symbol: string): Promise<DatedValue[]> {
  const rows = await fetchAllPages(async (from, to) => {
    const { data } = await supabase
      .from("daily_candles")
      .select("date, final_price")
      .eq("symbol", symbol)
      .order("date", { ascending: true })
      .range(from, to);
    return data ?? [];
  });
  return rows.filter((r) => r.final_price != null).map((r) => ({ date: r.date, value: r.final_price as number }));
}

async function fetchBenchmarkCandles(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  asset: string,
): Promise<DatedValue[]> {
  const rows = await fetchAllPages(async (from, to) => {
    const { data } = await supabase
      .from("benchmark_candles")
      .select("date, close")
      .eq("asset", asset)
      .order("date", { ascending: true })
      .range(from, to);
    return data ?? [];
  });
  return rows.filter((r) => r.close != null).map((r) => ({ date: r.date, value: r.close as number }));
}

async function fetchGlobalQuoteHistory(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  asset: string,
): Promise<{ value: number | null; captured_at: string }[]> {
  const rows = await fetchAllPages(async (from, to) => {
    const { data } = await supabase
      .from("global_quotes")
      .select("price, captured_at")
      .eq("asset", asset)
      .order("captured_at", { ascending: true })
      .range(from, to);
    return data ?? [];
  });
  return rows.map((r) => ({ value: r.price, captured_at: r.captured_at }));
}

export default async function GlobalPage() {
  const supabase = createServerSupabaseClient();

  const [tedpix, usdIrr, goldIrr, brentRaw, goldOunceRaw, dxyRaw, refineryCloses, metalsCloses, newsRaw] =
    await Promise.all([
      fetchBenchmarkCandles(supabase, "tedpix"),
      fetchBenchmarkCandles(supabase, "usd_irr"),
      fetchBenchmarkCandles(supabase, "gold_18k"),
      fetchGlobalQuoteHistory(supabase, "brent"),
      fetchGlobalQuoteHistory(supabase, "gold_ounce"),
      fetchGlobalQuoteHistory(supabase, "dxy"),
      Promise.all(REFINERY_SYMBOLS.map((s) => fetchSymbolCloses(supabase, s))),
      Promise.all(METALS_SYMBOLS.map((s) => fetchSymbolCloses(supabase, s))),
      supabase.from("news_items").select("title, url, published_at").order("published_at", { ascending: false }).limit(500),
    ]);

  const newsMarkers: NewsMarkerInput[] = (newsRaw.data ?? [])
    .filter((n) => n.published_at)
    .map((n) => ({ date: n.published_at!.slice(0, 10), title: n.title, url: n.url }));

  const brent = downsampleToDaily(brentRaw);
  const goldOunce = downsampleToDaily(goldOunceRaw);
  const dxy = downsampleToDaily(dxyRaw);

  const refineryIndex = buildEqualWeightIndex(refineryCloses);
  const metalsIndex = buildEqualWeightIndex(metalsCloses);

  const rebaseSeries: SeriesInput[] = [
    { name: "شاخص کل", color: "#6366f1", points: tedpix },
    { name: "برنت", color: "#f59e0b", points: brent },
    { name: "انس طلا", color: "#eab308", points: goldOunce },
    { name: "دلار آزاد", color: "#22c55e", points: usdIrr },
    { name: "DXY", color: "#ef4444", points: dxy },
  ];

  const heatmapAssets: AssetSeries[] = [
    { name: "شاخص کل", points: tedpix },
    { name: "دلار آزاد", points: usdIrr },
    { name: "طلای ۱۸", points: goldIrr },
    { name: "برنت", points: brent },
    { name: "انس طلا", points: goldOunce },
    { name: "DXY", points: dxy },
  ];

  function buildPair(label: string, leader: DatedValue[], follower: DatedValue[]): LeadLagPair {
    const followerByDate = new Map(follower.map((p) => [p.date, p.value]));
    const commonDates = leader.map((p) => p.date).filter((d) => followerByDate.has(d)).sort();
    const leaderByDate = new Map(leader.map((p) => [p.date, p.value]));
    const leaderVals = commonDates.map((d) => leaderByDate.get(d)!);
    const followerVals = commonDates.map((d) => followerByDate.get(d)!);
    if (leaderVals.length < 40) return { label, points: [], best: null };
    const points = crossCorrelation(leaderVals, followerVals, 15);
    return { label, points, best: bestLag(points) };
  }

  const leadLagPairs: LeadLagPair[] = [
    buildPair("برنت → شاخص پالایشی (ترکیب هم‌وزن نمادهای صنعت پالایش در واچ‌لیست)", brent, refineryIndex),
    buildPair("دلار آزاد → فلزات اساسی (ترکیب هم‌وزن نمادهای صنعت فلزات در واچ‌لیست)", usdIrr, metalsIndex),
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold">نمای جهانی</h1>
      <RebaseChart series={rebaseSeries} newsMarkers={newsMarkers} />
      <CorrelationHeatmap assets={heatmapAssets} />
      <LeadLagPanel pairs={leadLagPairs} />
      <p className="text-[11px] text-muted">
        برنت/انس طلا/DXY از منبع global_quotes می‌آیند که به‌تازگی فعال شده — تا چند هفتهٔ آینده که
        تاریخچهٔ بیشتری جمع شود، نمودارهای بالا کامل‌تر می‌شوند.
      </p>
    </div>
  );
}
