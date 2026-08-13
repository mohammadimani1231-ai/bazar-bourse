import { ClipboardList } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/serverClient.ts";
import { buildVirtualPortfolioReport } from "@/lib/virtualPortfolioReport.ts";
import { OUTCOME_LABEL_FA, type OutcomeLabel } from "@/lib/outcomeLabels.ts";
import { buildRuleReviewReport, type ReviewTradeInput } from "@/lib/ruleReview.ts";
import type { RuleEvaluationLike } from "@/lib/ruleStats.ts";
import { renderMultiLineChartSvg } from "@/lib/reportCharts.ts";
import { formatFaNumber, formatFaPercent } from "@/lib/format.ts";
import { formatJalaliDay } from "@/lib/jalali.ts";
import { EmptyState } from "@/components/EmptyState";

// دیتای زنده — نباید در build-time prerender و freeze شود (باگ شناخته‌شدهٔ فاز ۴)
export const dynamic = "force-dynamic";

const STATUS_FA: Record<string, string> = {
  executed: "اجرا شد",
  partial: "اجرای جزئی (کمبود نقد)",
  pending_queue: "در انتظار صف",
  expired_queue: "منقضی به دلیل صف",
  rejected_liquidity: "رد: کمبود نقدینگی",
  rejected_max_positions: "رد: سقف پوزیشن",
  rejected_stale_data: "رد: دادهٔ کهنه/تعطیلی",
  closed: "بسته‌شده",
};

const LABEL_COLOR: Record<OutcomeLabel, string> = {
  rule_worked: "text-up",
  rule_failed_no_shock: "text-down",
  external_shock: "text-warning",
  microstructure_limit: "text-muted",
};

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface shadow-card p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="ltr-nums mt-1 text-xl font-bold text-foreground">{value}</p>
      {note && <p className="mt-1 text-[11px] text-muted">{note}</p>}
    </div>
  );
}

export default async function TrackRecordPage() {
  const supabase = createServerSupabaseClient();
  const report = await buildVirtualPortfolioReport(supabase);
  const { metrics } = report;

  const chartSvg = renderMultiLineChartSvg([
    { label: "پرتفوی مجازی", color: "var(--accent)", points: report.equityPoints.map((p) => ({ x: p.date, y: p.equity })) },
    ...report.benchmarkCurves.map((c, i) => ({
      label: c.label,
      color: i === 0 ? "var(--series2)" : "var(--series3)",
      points: c.points.map((p) => ({ x: p.date, y: p.equity })),
    })),
  ]);

  const hasData = report.allTrades.length > 0;

  // بخش ۶ — بازبینی انسان-در-حلقه. on-demand روی همین صفحه محاسبه می‌شود، بدون هیچ نوشتنی.
  const reviewInputs: ReviewTradeInput[] = report.allTrades.map((t) => ({
    reasons: Array.isArray(t.signal_reasons) ? (t.signal_reasons as RuleEvaluationLike[]) : [],
    returnPct: t.return_pct == null ? null : Number(t.return_pct),
    label: report.outcomeLabels.get(t.id)?.label ?? null,
  }));
  const review = buildRuleReviewReport(reviewInputs, new Date().toISOString());

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <p className="mt-1 text-sm text-muted">
          سیستم سیگنال‌های خودش را با بودجهٔ فرضی {formatFaNumber(report.initialCapital)} تومان اجرا می‌کند و نتیجه را
          بدون دستکاری اینجا نشان می‌دهد. این صفحه ابزار اعتمادسازی است، نه تبلیغ — اگر عملکرد بد بود، همان‌طور
          نمایش داده می‌شود. نتایج این پرتفوی هرگز به‌صورت خودکار وزن یا آستانهٔ سیگنال‌ها را تغییر نمی‌دهند.
        </p>
        <p className="mt-2 text-xs text-muted">
          این دفتر <strong className="text-foreground">کاملاً خودکار</strong> است و کاملاً از دفتر معاملات دستی شما در{" "}
          <a href="/portfolio" className="text-accent hover:underline">
            صفحهٔ پرتفوی
          </a>{" "}
          جداست — آنجا تمرین دستی خودتان ثبت می‌شود، اینجا راستی‌آزمایی خودکار سیستم. دو جدول مستقل‌اند و هیچ‌کدام
          روی دیگری اثر نمی‌گذارد.
        </p>
        {report.startedAt && (
          <p className="ltr-nums mt-1 text-xs text-muted">
            شروع فعالیت: {formatJalaliDay(report.startedAt + "T00:00:00Z")} · {formatFaNumber(metrics.periodDays)} روز
          </p>
        )}
      </div>

      {!hasData ? (
        <div className="rounded-lg border border-border bg-surface shadow-card p-3">
          <EmptyState
            icon={ClipboardList}
            title="هنوز هیچ سیگنالی در پرتفوی مجازی اجرا نشده"
            description="موتور اجرای مجازی در ساعات بازار هر ۱۰ دقیقه سیگنال‌های جدید را برمی‌دارد. اولین رکوردها بعد از نخستین جلسهٔ معاملاتی با سیگنال ظاهر می‌شوند."
          />
        </div>
      ) : (
        <>
          {metrics.notes.length > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
              <p className="text-xs font-bold text-warning">محدودیت‌های آماری این اعداد</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-muted">
                {metrics.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric
              label="بازده کل"
              value={metrics.totalReturnPct == null ? "هنوز شروع نشده" : formatFaPercent(metrics.totalReturnPct)}
              note={
                metrics.totalReturnPct == null
                  ? "هیچ پوزیشنی باز نشده — این با «بازده صفر» یکی نیست"
                  : `${formatFaNumber(metrics.totalTrades)} معاملهٔ بسته‌شده`
              }
            />
            <Metric
              label="نرخ برد"
              value={metrics.sampleAdequate ? formatFaPercent(metrics.winRatePct) : "دادهٔ کافی نیست"}
              note={metrics.sampleAdequate ? undefined : "نمونه کمتر از ۲۰ معامله"}
            />
            <Metric
              label="Profit Factor"
              value={
                metrics.sampleAdequate
                  ? Number.isFinite(metrics.profitFactor)
                    ? formatFaNumber(metrics.profitFactor, 3)
                    : "بدون معاملهٔ زیان‌ده"
                  : "دادهٔ کافی نیست"
              }
            />
            <Metric label="بیشترین افت سرمایه" value={formatFaPercent(metrics.maxDrawdownPct)} />
            <Metric
              label="Sharpe"
              value={metrics.sharpe == null ? "دادهٔ کافی نیست" : formatFaNumber(metrics.sharpe, 2)}
              note={metrics.sharpe == null ? "دوره کمتر از ۹۰ روز" : undefined}
            />
            <Metric
              label="CAGR"
              value={metrics.cagrPct == null ? "دادهٔ کافی نیست" : formatFaPercent(metrics.cagrPct)}
              note={metrics.cagrPct == null ? "دوره کمتر از یک سال" : undefined}
            />
            <Metric
              label="میانگین مدت نگهداری"
              value={metrics.avgHoldingDays == null ? "—" : `${formatFaNumber(metrics.avgHoldingDays, 1)} روز`}
            />
            <Metric
              label="٪ میانگین سرمایهٔ درگیر"
              value={metrics.avgCapitalDeployedPct == null ? "—" : formatFaPercent(metrics.avgCapitalDeployedPct)}
              note="باقی سرمایه نقد مانده (بازدهی صفر فرض شده)"
            />
          </section>

          <section className="rounded-lg border border-border bg-surface shadow-card p-4">
            <h2 className="text-sm font-bold text-foreground">منحنی سرمایه در برابر بنچمارک‌ها</h2>
            <p className="mt-1 text-xs text-muted">
              مارک‌تومارکت واقعی (نقد + ارزش روز پوزیشن‌های باز). بنچمارک‌ها روی همان سرمایهٔ اولیه هم‌مقیاس
              شده‌اند. محور زمان چپ→راست است.
            </p>
            <div className="mt-3 overflow-x-auto" dangerouslySetInnerHTML={{ __html: chartSvg }} />
          </section>

          <section className="rounded-lg border border-border bg-surface shadow-card p-4">
            <h2 className="text-sm font-bold text-foreground">مقایسه با بنچمارک‌ها</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted">
                    <th className="p-2 text-right">بنچمارک</th>
                    <th className="p-2 text-right">بازده بنچمارک</th>
                    <th className="p-2 text-right">بازده مازاد پرتفوی</th>
                  </tr>
                </thead>
                <tbody>
                  {report.benchmarkComparison.map((row) => (
                    <tr key={row.label} className="border-b border-border/50">
                      <td className="p-2 text-foreground">{row.label}</td>
                      <td className="ltr-nums p-2 text-muted">
                        {row.benchmarkReturnPct == null ? "دادهٔ موجود نیست" : formatFaPercent(row.benchmarkReturnPct)}
                      </td>
                      <td
                        className={`ltr-nums p-2 ${row.excessPct == null ? "text-muted" : row.excessPct >= 0 ? "text-up" : "text-down"}`}
                      >
                        {row.excessPct == null ? "—" : formatFaPercent(row.excessPct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              «Buy &amp; Hold همان سهام» مهارت انتخاب سهم را از مهارت زمان‌بندی جدا می‌کند: اگر پرتفوی از آن عقب باشد،
              یعنی خود ورود/خروج ارزش منفی داشته.
            </p>
          </section>

          <section className="rounded-lg border border-border bg-surface shadow-card p-4">
            <h2 className="text-sm font-bold text-foreground">بازده فرضی سیگنال‌ها در افق‌های ثابت</h2>
            <p className="mt-1 text-xs text-muted">مستقل از خروج واقعی پرتفوی — یعنی «اگر صرفاً نگه می‌داشتیم».</p>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {report.horizons.map((h) => (
                <Metric
                  key={h.horizonDays}
                  label={`افق ${formatFaNumber(h.horizonDays)} روزه`}
                  value={h.avgReturnPct == null ? "دادهٔ کافی نیست" : formatFaPercent(h.avgReturnPct)}
                  note={
                    h.evaluated === 0
                      ? "هیچ سیگنالی هنوز به این افق نرسیده"
                      : `${formatFaNumber(h.evaluated)} سیگنال · نرخ برد ${formatFaPercent(h.winRatePct)}`
                  }
                />
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface shadow-card p-4">
            <h2 className="text-sm font-bold text-foreground">توزیع علت نتیجه</h2>
            <p className="mt-1 text-xs text-muted">
              برچسب‌ها کاملاً عینی و خودکارند (بدون قضاوت هوش مصنوعی). آستانهٔ «شوک بیرونی» پرسنتایلی است، نه عدد ثابت.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {(Object.keys(OUTCOME_LABEL_FA) as OutcomeLabel[]).map((key) => (
                <Metric key={key} label={OUTCOME_LABEL_FA[key]} value={formatFaNumber(report.labelCounts[key])} />
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface shadow-card p-4">
            <h2 className="text-sm font-bold text-foreground">بازبینی قوانین سیگنال (انسان در حلقه)</h2>
            <p className="mt-1 text-xs text-muted">{review.disclaimer}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted">
                    <th className="p-2 text-right">قانون</th>
                    <th className="p-2 text-right">حضور</th>
                    <th className="p-2 text-right">نرخ برد</th>
                    <th className="p-2 text-right">Profit Factor</th>
                    <th className="p-2 text-right">پیشنهاد برای بررسی شما</th>
                  </tr>
                </thead>
                <tbody>
                  {review.rows.length === 0 ? (
                    <tr>
                      <td className="p-3 text-xs text-muted" colSpan={5}>
                        هنوز هیچ معاملهٔ بسته‌شده‌ای برای بازبینی قوانین وجود ندارد.
                      </td>
                    </tr>
                  ) : (
                    review.rows.map((r) => (
                      <tr key={r.rule} className="border-b border-border/50">
                        <td className="p-2 font-bold text-foreground">{r.rule}</td>
                        <td className="ltr-nums p-2 text-muted">{formatFaNumber(r.count)}</td>
                        <td className="ltr-nums p-2 text-muted">
                          {r.adequateSample && r.winRate != null ? formatFaPercent(r.winRate) : "—"}
                        </td>
                        <td className="ltr-nums p-2 text-muted">
                          {r.adequateSample && r.profitFactor != null ? formatFaNumber(r.profitFactor, 2) : "—"}
                        </td>
                        <td className={`p-2 text-xs ${r.adequateSample ? "text-foreground" : "text-muted"}`}>
                          {r.suggestion}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface shadow-card p-4">
            <h2 className="text-sm font-bold text-foreground">همهٔ سیگنال‌ها و سرنوشتشان</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted">
                    <th className="p-2 text-right">نماد</th>
                    <th className="p-2 text-right">تاریخ سیگنال</th>
                    <th className="p-2 text-right">وضعیت</th>
                    <th className="p-2 text-right">بازده</th>
                    <th className="p-2 text-right">علت خروج</th>
                    <th className="p-2 text-right">برچسب علت نتیجه</th>
                  </tr>
                </thead>
                <tbody>
                  {[...report.allTrades].reverse().map((t) => {
                    const label = report.outcomeLabels.get(t.id);
                    return (
                      <tr key={t.id} className="border-b border-border/50">
                        <td className="p-2 font-bold text-foreground">{t.symbol}</td>
                        <td className="ltr-nums p-2 text-muted">{formatJalaliDay(t.signal_at)}</td>
                        <td className="p-2 text-muted" title={t.status_note ?? undefined}>
                          {STATUS_FA[t.status] ?? t.status}
                        </td>
                        <td
                          className={`ltr-nums p-2 ${t.return_pct == null ? "text-muted" : Number(t.return_pct) >= 0 ? "text-up" : "text-down"}`}
                        >
                          {t.return_pct == null ? "—" : formatFaPercent(Number(t.return_pct))}
                        </td>
                        <td className="p-2 text-muted">{t.exit_reason ?? "—"}</td>
                        <td
                          className={`p-2 ${label ? LABEL_COLOR[label.label] : "text-muted"}`}
                          title={label?.reason ?? undefined}
                        >
                          {label ? OUTCOME_LABEL_FA[label.label] : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
