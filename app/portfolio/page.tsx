import { createServerSupabaseClient } from "@/lib/supabase/serverClient.ts";
import { formatFaNumber, formatFaPercent } from "@/lib/format.ts";
import { formatJalaliDay } from "@/lib/jalali.ts";
import { renderLineChartSvg, type LinePoint } from "@/lib/reportCharts.ts";
import { PortfolioClient, type ClosePositionRow, type OpenPositionRow } from "@/components/PortfolioClient";

export const dynamic = "force-dynamic";

interface PaperTradeRow {
  id: number;
  symbol: string;
  signal_id: number | null;
  entry_price: number;
  stop_loss: number | null;
  share_count: number;
  entry_date: string;
  exit_price: number | null;
  exit_date: string | null;
  status: string;
  notes: string | null;
}

export default async function PortfolioPage() {
  const supabase = createServerSupabaseClient();

  const [{ data: riskSettings }, { data: trades }, { data: watchlist }] = await Promise.all([
    supabase.from("risk_settings").select("total_capital, max_sector_exposure_pct").eq("id", 1).maybeSingle(),
    supabase
      .from("paper_trades")
      .select("id, symbol, signal_id, entry_price, stop_loss, share_count, entry_date, exit_price, exit_date, status, notes")
      .order("created_at", { ascending: false }),
    supabase.from("watchlist").select("symbol, industry, company_name"),
  ]);

  const industryOf = new Map((watchlist ?? []).map((w) => [w.symbol as string, (w.industry as string | null) ?? "سایر"]));
  const symbolOptions = (watchlist ?? [])
    .map((w) => ({ symbol: w.symbol as string, companyName: (w.company_name as string | null) ?? null }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol, "fa"));
  const rows = (trades ?? []) as PaperTradeRow[];
  const openTrades = rows.filter((t) => t.status === "open");
  const closedTrades = rows.filter((t) => t.status === "closed");

  const openSymbols = [...new Set(openTrades.map((t) => t.symbol))];
  let latestPriceBySymbol = new Map<string, number>();
  if (openSymbols.length > 0) {
    const { data: quoteRows } = await supabase
      .from("quotes")
      .select("symbol, last_price, captured_at")
      .in("symbol", openSymbols)
      .order("captured_at", { ascending: false })
      .limit(500);
    latestPriceBySymbol = new Map();
    for (const q of quoteRows ?? []) {
      if (!latestPriceBySymbol.has(q.symbol) && q.last_price != null) {
        latestPriceBySymbol.set(q.symbol, q.last_price as number);
      }
    }
  }

  const totalCapital = riskSettings?.total_capital ?? null;
  const maxSectorExposurePct = riskSettings?.max_sector_exposure_pct ?? 30;

  const openPositions: OpenPositionRow[] = openTrades.map((t) => {
    const currentPrice = latestPriceBySymbol.get(t.symbol) ?? null;
    const positionValue = t.share_count * t.entry_price;
    const currentValue = currentPrice != null ? t.share_count * currentPrice : null;
    const unrealizedPnl = currentValue != null ? currentValue - positionValue : null;
    const unrealizedPnlPct = unrealizedPnl != null && positionValue > 0 ? (unrealizedPnl / positionValue) * 100 : null;
    return {
      id: t.id,
      symbol: t.symbol,
      industry: industryOf.get(t.symbol) ?? "سایر",
      entryPrice: t.entry_price,
      stopLoss: t.stop_loss,
      shareCount: t.share_count,
      entryDateFa: formatJalaliDay(t.entry_date),
      currentPrice,
      positionValue,
      unrealizedPnl,
      unrealizedPnlPct,
      notes: t.notes,
    };
  });

  const closedPositions: ClosePositionRow[] = closedTrades
    .filter((t) => t.exit_price != null && t.exit_date != null)
    .map((t) => {
      const positionValue = t.share_count * t.entry_price;
      const realizedPnl = (t.exit_price! - t.entry_price) * t.share_count;
      const realizedPnlPct = positionValue > 0 ? (realizedPnl / positionValue) * 100 : null;
      return {
        id: t.id,
        symbol: t.symbol,
        entryPrice: t.entry_price,
        exitPrice: t.exit_price!,
        shareCount: t.share_count,
        entryDateFa: formatJalaliDay(t.entry_date),
        exitDateFa: formatJalaliDay(t.exit_date!),
        exitDate: t.exit_date!,
        realizedPnl,
        realizedPnlPct,
      };
    })
    .sort((a, b) => a.exitDate.localeCompare(b.exitDate));

  const totalOpenValue = openPositions.reduce((sum, p) => sum + p.positionValue, 0);
  const totalOpenPct = totalCapital && totalCapital > 0 ? (totalOpenValue / totalCapital) * 100 : null;

  const sectorMap = new Map<string, number>();
  for (const p of openPositions) {
    sectorMap.set(p.industry, (sectorMap.get(p.industry) ?? 0) + p.positionValue);
  }
  const sectorRows = [...sectorMap.entries()]
    .map(([industry, value]) => ({
      industry,
      value,
      pct: totalCapital && totalCapital > 0 ? (value / totalCapital) * 100 : null,
    }))
    .sort((a, b) => b.value - a.value);

  // منحنی سود/زیان محقق‌شدهٔ تجمعی معاملات کاغذی بسته‌شده — نه یک equity curve پیوستهٔ
  // روزانه (که نیاز به snapshot دوره‌ای دارد، خارج از scope فاز ۸)؛ برچسب صادقانه، نه گمراه‌کننده.
  const equityCurvePoints: LinePoint[] = closedPositions.reduce<LinePoint[]>((acc, c) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].y : 0;
    acc.push({ x: c.exitDateFa, y: prev + c.realizedPnl });
    return acc;
  }, []);
  const equityCurveSvg = equityCurvePoints.length >= 2 ? renderLineChartSvg(equityCurvePoints, { width: 600, height: 160 }) : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold">پرتفوی کاغذی (دستی)</h1>
        <p className="text-xs text-muted">ثبت دستی معامله برای پیگیری بدون پول واقعی — هیچ اجرای خودکاری وجود ندارد.</p>
        <p className="mt-1 text-xs text-muted">
          این دفتر <strong className="text-foreground">تمرین دستی خودتان</strong> است. راستی‌آزمایی خودکار سیگنال‌های
          سیستم جدا در{" "}
          <a href="/track-record" className="text-accent hover:underline">
            کارنامهٔ عملکرد
          </a>{" "}
          نگه‌داری می‌شود — دو جدول مستقل با دو هدف متفاوت؛ هیچ‌کدام روی دیگری اثر نمی‌گذارد.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface shadow-card p-3">
          <p className="text-xs text-muted">پوزیشن‌های باز</p>
          <p className="ltr-nums text-right text-lg font-bold">{openPositions.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface shadow-card p-3">
          <p className="text-xs text-muted">ارزش پوزیشن‌های باز</p>
          <p className="ltr-nums text-right text-lg font-bold">{formatFaNumber(totalOpenValue)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface shadow-card p-3">
          <p className="text-xs text-muted">درصد سرمایهٔ درگیر</p>
          <p className="ltr-nums text-right text-lg font-bold">{totalOpenPct == null ? "—" : formatFaPercent(totalOpenPct)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface shadow-card p-3">
          <p className="text-xs text-muted">معاملات بسته‌شده</p>
          <p className="ltr-nums text-right text-lg font-bold">{closedPositions.length}</p>
        </div>
      </div>

      {sectorRows.length > 0 && (
        <div className="rounded-lg border border-border bg-surface shadow-card p-3">
          <h2 className="mb-2 text-sm font-bold">تخصیص صنعتی</h2>
          <div className="flex flex-col gap-1">
            {sectorRows.map((s) => (
              <div key={s.industry} className="flex items-center justify-between text-xs">
                <span className={s.pct != null && s.pct > maxSectorExposurePct ? "text-down" : "text-foreground"}>
                  {s.industry}
                </span>
                <span className="ltr-nums text-muted">
                  {formatFaNumber(s.value)} ({s.pct == null ? "—" : formatFaPercent(s.pct)})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <PortfolioClient openPositions={openPositions} closedPositions={closedPositions} symbolOptions={symbolOptions} />

      <div className="rounded-lg border border-border bg-surface shadow-card p-3">
        <h2 className="mb-2 text-sm font-bold">منحنی سود/زیان محقق‌شدهٔ تجمعی</h2>
        {equityCurveSvg ? (
          <div className="ltr-nums" dangerouslySetInnerHTML={{ __html: equityCurveSvg }} />
        ) : (
          <p className="text-xs text-muted">با حداقل ۲ معاملهٔ بسته‌شده این منحنی نمایش داده می‌شود.</p>
        )}
      </div>
    </div>
  );
}
