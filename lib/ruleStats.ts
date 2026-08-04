export interface RuleEvaluationLike {
  rule: string;
  triggered: boolean;
}

export interface EvaluatedSignal {
  reasons: RuleEvaluationLike[];
  returnPct: number | null;
}

export interface RuleStat {
  rule: string;
  count: number;
  winRate: number | null;
  profitFactor: number | null;
}

/**
 * عملکرد هر قانون از سیگنال‌های واقعا evaluate‌شده (signal_outcomes) — یک سیگنال می‌تواند
 * چند قانون trigger‌شده داشته باشد، بازدهش به همهٔ آن قانون‌ها نسبت داده می‌شود.
 */
export function computeRuleStats(evaluations: EvaluatedSignal[]): RuleStat[] {
  const byRule = new Map<string, number[]>();
  for (const e of evaluations) {
    if (e.returnPct == null) continue;
    for (const r of e.reasons) {
      if (!r.triggered) continue;
      const list = byRule.get(r.rule) ?? [];
      list.push(e.returnPct);
      byRule.set(r.rule, list);
    }
  }

  const stats: RuleStat[] = [];
  for (const [rule, returns] of byRule) {
    const wins = returns.filter((r) => r > 0);
    const losses = returns.filter((r) => r < 0);
    const grossProfit = wins.reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
    stats.push({
      rule,
      count: returns.length,
      winRate: (wins.length / returns.length) * 100,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    });
  }
  return stats.sort((a, b) => b.count - a.count);
}
