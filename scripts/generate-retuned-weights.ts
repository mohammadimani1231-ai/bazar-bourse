/**
 * تولید فایل وزن‌های بازتنظیم‌شدهٔ قوانین سیگنال، فقط از روی گزارش بک‌تست (train-only)،
 * به‌جای تنظیم دستی/آزاد. طبق تأیید کاربر (پرامپت ۳، ۲۰۲۶-۰۸-۰۹):
 *
 * - قانونی که در بازهٔ train کمتر از MIN_TRIGGERS_TO_TUNE (در scripts/backtest.ts، فعلاً ۲۰) بار
 *   trigger شده «قابل بازتنظیم» نیست — همان وزن heuristic اولیهٔ STAGE03_BASELINE_RULES می‌ماند.
 * - قانون قابل‌بازتنظیم: وزن متناسب با win-rate نسبت به مبنای ۵۰٪ (شیر یا خط) مقیاس می‌شود —
 *   newWeight = round(baselineWeight × clamp(winRate/50, 0.5, 1.5))
 *   یعنی اگر قانونی کمتر از نصف مواقع برنده بوده، وزنش (و در نتیجه سهمش در امتیاز مرکب) کم
 *   می‌شود؛ اگر بیشتر از نصف برنده بوده، زیاد می‌شود. کلمپ ±۵۰٪ عمداً محافظه‌کارانه است تا یک
 *   قانون با win-rate خیلی افراطی (مثلاً روی نمونهٔ کوچک نزدیک آستانه) وزنش را بیش‌ازحد عوض نکند.
 *
 * استفاده: tsx scripts/generate-retuned-weights.ts <backtest-report.json> <output.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { SignalRule } from "../lib/signal-engine.ts";

const MIN_TRIGGERS_TO_TUNE = 20; // باید با مقدار scripts/backtest.ts یکی باشد

const STAGE03_BASELINE_RULES: SignalRule[] = [
  { name: "rsi_oversold", definition: { type: "threshold", metric: "rsi14", op: "<", value: 30 }, weight: 15, enabled: true },
  { name: "rsi_overbought", definition: { type: "threshold", metric: "rsi14", op: ">", value: 70 }, weight: -15, enabled: true },
  { name: "ema_cross_up", definition: { type: "cross", fast: "EMA9", slow: "EMA26", direction: "up" }, weight: 20, enabled: true },
  { name: "ema_cross_down", definition: { type: "cross", fast: "EMA9", slow: "EMA26", direction: "down" }, weight: -20, enabled: true },
  { name: "suspicious_volume", definition: { type: "threshold", metric: "suspicious_volume", op: "==", value: 1 }, weight: 10, enabled: true },
  { name: "buyer_power_strong", definition: { type: "threshold", metric: "buyer_power", op: ">", value: 2 }, weight: 15, enabled: true },
  { name: "money_inflow_3d", definition: { type: "streak", metric: "money_flow", op: ">", value: 0, days: 3 }, weight: 20, enabled: true },
  { name: "near_52w_high", definition: { type: "threshold", metric: "pct_from_52w_high", op: ">=", value: -3 }, weight: 15, enabled: true },
  { name: "near_52w_low", definition: { type: "threshold", metric: "pct_from_52w_low", op: "<=", value: 3 }, weight: -15, enabled: true },
  { name: "composite_rank_strong", definition: { type: "threshold", metric: "composite_rank", op: ">=", value: 80 }, weight: 15, enabled: true },
];

interface TrainPerRuleEntry {
  triggered: number;
  winRate: number;
  totalPnl: number;
  tunable: boolean;
}

const [, , reportPath, outPath] = process.argv;
if (!reportPath || !outPath) {
  console.error("استفاده: tsx scripts/generate-retuned-weights.ts <backtest-report.json> <output.json>");
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, "utf-8"));
const trainPerRule: Record<string, TrainPerRuleEntry> | undefined = report.summary?.trainTestSplit?.trainPerRule;
if (!trainPerRule) {
  console.error("گزارش ورودی فیلد summary.trainTestSplit.trainPerRule ندارد.");
  process.exit(1);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const log: string[] = [];
const retuned: SignalRule[] = STAGE03_BASELINE_RULES.map((rule) => {
  const stats = trainPerRule[rule.name];
  if (!stats || stats.triggered < MIN_TRIGGERS_TO_TUNE) {
    log.push(
      `${rule.name}: داده‌ی کافی برای تنظیم نداشت (trigger=${stats?.triggered ?? 0} < ${MIN_TRIGGERS_TO_TUNE}) → وزن پیش‌فرض stage03 نگه داشته شد (${rule.weight})`,
    );
    return rule;
  }
  const factor = clamp(stats.winRate / 50, 0.5, 1.5);
  const newWeight = Math.round(rule.weight * factor);
  log.push(
    `${rule.name}: trigger=${stats.triggered}, winRate=${stats.winRate.toFixed(1)}٪ → factor=${factor.toFixed(3)} → وزن ${rule.weight} → ${newWeight}`,
  );
  return { ...rule, weight: newWeight };
});

writeFileSync(outPath, JSON.stringify(retuned, null, 2), "utf-8");
console.log(`MIN_TRIGGERS_TO_TUNE = ${MIN_TRIGGERS_TO_TUNE}\n`);
console.log(log.join("\n"));
console.log(`\nنوشته شد: ${outPath}`);
