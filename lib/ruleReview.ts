import { computeRuleStats, type EvaluatedSignal, type RuleEvaluationLike, type RuleStat } from "./ruleStats.ts";
import { OUTCOME_LABEL_FA, type OutcomeLabel } from "./outcomeLabels.ts";

/**
 * بازبینی دوره‌ای قوانین سیگنال بر اساس معاملات پرتفوی مجازی (بخش ۶) — **انسان در حلقه**.
 *
 * قید #۱۴ (جریان یک‌طرفه): این ماژول فقط **پیشنهاد برای بررسی انسانی** تولید می‌کند و هیچ
 * چیزی در `signal_rules` نمی‌نویسد. هیچ تابعی اینجا وزن یا آستانه‌ای را تغییر نمی‌دهد؛
 * خروجی‌اش صرفاً متن است. اگر روزی کسی خواست از این خروجی یک به‌روزرسانی خودکار بسازد،
 * آن تغییر نقض صریح قید #۱۴ است.
 *
 * گیت آماری همان گیت بک‌تست است (`MIN_TRIGGERS_TO_TUNE` در scripts/backtest.ts): قانونی که
 * کمتر از ۲۰ بار در معاملات حضور داشته «دادهٔ کافی نیست» می‌گیرد و **هیچ پیشنهادی** برایش
 * صادر نمی‌شود — روی نمونهٔ کوچک، «بهترین» وزن صرفاً نویز است.
 */

/** هم‌ارز عمدی با MIN_TRIGGERS_TO_TUNE در scripts/backtest.ts — تغییر یکی بدون دیگری ممنوع. */
export const MIN_APPEARANCES_FOR_REVIEW = 20;

export interface ReviewTradeInput {
  /** snapshot قوانین لحظهٔ صدور سیگنال (ستون signal_reasons). */
  reasons: RuleEvaluationLike[];
  /** بازده خالص معاملهٔ بسته‌شده؛ null یعنی هنوز بسته نشده یا اصلاً اجرا نشده. */
  returnPct: number | null;
  /** برچسب علت نتیجه (بخش ۳) — برای جدا کردن «ضعف edge» از «شوک/ریزساختار». */
  label: OutcomeLabel | null;
}

export interface RuleReviewRow extends RuleStat {
  /** آیا نمونه به حد گیت آماری رسیده. */
  adequateSample: boolean;
  /** شمارش برچسب‌های علت در معاملاتی که این قانون در آن‌ها حضور داشته. */
  labelCounts: Record<OutcomeLabel, number>;
  /** پیشنهاد برای بررسی انسانی — هرگز اعمال نمی‌شود. */
  suggestion: string;
}

export interface RuleReviewReport {
  generatedAt: string;
  totalTradesConsidered: number;
  minAppearances: number;
  rows: RuleReviewRow[];
  /** یادآوری حاکمیتی که در هر خروجی (UI/گزارش) باید دیده شود. */
  disclaimer: string;
}

const DISCLAIMER =
  "این گزارش فقط پیشنهاد برای بررسی انسانی تولید می‌کند و هیچ تغییری در قوانین یا وزن‌های سیگنال اعمال نمی‌کند. " +
  "هر تغییری باید دستی، آگاهانه و توسط کاربر انجام شود (قید #۱۴ — جریان یک‌طرفه، بدون حلقهٔ خودآموزی خودکار).";

function emptyLabelCounts(): Record<OutcomeLabel, number> {
  return { rule_worked: 0, rule_failed_no_shock: 0, external_shock: 0, microstructure_limit: 0 };
}

/**
 * پیشنهاد متنی — عمداً هیچ عدد وزن پیشنهادی نمی‌دهد، فقط جهت بررسی را نشان می‌دهد. دادن
 * عدد دقیق، وسوسهٔ اعمال خودکارش را می‌سازد و دقیقاً همان چیزی است که قید #۱۴ منع می‌کند.
 */
function buildSuggestion(row: RuleStat, labelCounts: Record<OutcomeLabel, number>, adequate: boolean): string {
  if (!adequate) {
    return `دادهٔ کافی نیست (${row.count} حضور، کمتر از ${MIN_APPEARANCES_FOR_REVIEW}) — هیچ پیشنهادی صادر نمی‌شود.`;
  }

  const shockShare = labelCounts.external_shock / Math.max(1, row.count);
  const microShare = labelCounts.microstructure_limit / Math.max(1, row.count);

  if (microShare >= 0.5) {
    return `بیش از نیمی از حضورهای این قانون به اجرا نرسیده یا با تأخیر صف اجرا شده — پیش از قضاوت دربارهٔ کیفیت خود قانون، محدودیت اجرا را بررسی کنید.`;
  }
  if (shockShare >= 0.5) {
    return `بیش از نیمی از نتایج این قانون هم‌زمان با جهش تنش بوده — عملکرد ضعیف احتمالاً به شرایط بیرونی برمی‌گردد نه به خود قانون. برای بررسی انسانی.`;
  }
  if (row.winRate != null && row.winRate < 40 && labelCounts.rule_failed_no_shock > labelCounts.rule_worked) {
    return `نرخ برد ${row.winRate.toFixed(1)}٪ روی نمونهٔ کافی، و بیشتر شکست‌ها بدون شوک بیرونی — کاندید بررسی برای کاهش وزن یا بازتعریف. تصمیم با شماست.`;
  }
  if (row.winRate != null && row.winRate > 60) {
    return `نرخ برد ${row.winRate.toFixed(1)}٪ روی نمونهٔ کافی — کاندید بررسی برای افزایش وزن. تصمیم با شماست.`;
  }
  return "عملکرد در محدودهٔ خنثی — دلیلی برای بازبینی دیده نمی‌شود.";
}

export function buildRuleReviewReport(trades: ReviewTradeInput[], generatedAt: string): RuleReviewReport {
  const evaluations: EvaluatedSignal[] = trades
    .filter((t) => t.returnPct != null)
    .map((t) => ({ reasons: t.reasons, returnPct: t.returnPct }));

  const stats = computeRuleStats(evaluations);

  // شمارش برچسب‌ها به تفکیک قانون — یک معامله به همهٔ قوانین trigger‌شده‌اش نسبت داده می‌شود
  // (همان قرارداد computeRuleStats، تا دو عدد کنار هم قابل مقایسه بمانند).
  const labelsByRule = new Map<string, Record<OutcomeLabel, number>>();
  for (const t of trades) {
    if (t.label == null) continue;
    for (const r of t.reasons) {
      if (!r.triggered) continue;
      const counts = labelsByRule.get(r.rule) ?? emptyLabelCounts();
      counts[t.label] += 1;
      labelsByRule.set(r.rule, counts);
    }
  }

  const rows: RuleReviewRow[] = stats.map((s) => {
    const labelCounts = labelsByRule.get(s.rule) ?? emptyLabelCounts();
    const adequateSample = s.count >= MIN_APPEARANCES_FOR_REVIEW;
    return {
      ...s,
      adequateSample,
      labelCounts,
      suggestion: buildSuggestion(s, labelCounts, adequateSample),
    };
  });

  return {
    generatedAt,
    totalTradesConsidered: evaluations.length,
    minAppearances: MIN_APPEARANCES_FOR_REVIEW,
    rows,
    disclaimer: DISCLAIMER,
  };
}

/** برچسب فارسی هر ستون توزیع — تا UI و گزارش از یک منبع بخوانند. */
export const REVIEW_LABEL_HEADERS = OUTCOME_LABEL_FA;
