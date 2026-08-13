import { createServerSupabaseClient } from "@/lib/supabase/serverClient.ts";
import { SignalsTabs } from "@/components/SignalsTabs";
import { computeRuleStats } from "@/lib/ruleStats.ts";
import type { SignalRow } from "@/components/SignalsTable";

// دیتای زنده (قیمت/پول/سیگنال) — نباید در build-time prerender و freeze شود
export const dynamic = "force-dynamic";

export default async function SignalsPage() {
  const supabase = createServerSupabaseClient();

  const [{ data: signalsRaw }, { data: evaluatedRaw }] = await Promise.all([
    supabase
      .from("signals")
      .select("id, symbol, direction, score, reasons, regime, created_at")
      .order("created_at", { ascending: false })
      .limit(150),
    supabase
      .from("signals")
      .select("score, reasons, signal_outcomes(return_5d)")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const initialSignals: SignalRow[] = (signalsRaw ?? []).map((s) => ({
    id: s.id,
    symbol: s.symbol,
    direction: s.direction,
    score: s.score,
    reasons: s.reasons ?? [],
    regime: s.regime,
    createdAt: s.created_at,
  }));

  interface EvaluatedRawRow {
    score: number;
    reasons: { rule: string; triggered: boolean }[];
    signal_outcomes: { return_5d: number | null } | { return_5d: number | null }[] | null;
  }

  const evaluated = (evaluatedRaw ?? []) as unknown as EvaluatedRawRow[];
  const withOutcome = evaluated
    .map((s) => {
      const outcome = Array.isArray(s.signal_outcomes) ? s.signal_outcomes[0] : s.signal_outcomes;
      return { score: s.score, reasons: s.reasons ?? [], returnPct: outcome?.return_5d ?? null };
    })
    .filter((s) => s.returnPct != null);

  const ruleStats = computeRuleStats(withOutcome);
  const scorePoints = withOutcome.map((s) => ({ score: s.score, returnPct: s.returnPct! }));

  return (
    <div className="flex flex-col gap-4">
      <SignalsTabs initialSignals={initialSignals} ruleStats={ruleStats} scorePoints={scorePoints} />
    </div>
  );
}
