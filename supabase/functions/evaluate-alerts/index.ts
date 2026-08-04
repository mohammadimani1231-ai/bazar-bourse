import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { sendTelegramMessage } from "../_shared/telegram.ts";
import { tensionConditionMet, isCooldownElapsed, type AlertCondition } from "../../../lib/alertEngine.ts";
import { formatSignalAlert, formatTensionAlert, formatPipelineDownAlert } from "../../../lib/alertFormat.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://bazar-bourse.vercel.app";
const SIGNAL_LOOKBACK_FALLBACK_MIN = 15; // اگر این قانون هنوز هرگز شلیک نشده

interface RuleRow {
  id: number;
  name: string;
  condition: AlertCondition;
  severity: string;
  fire_policy: "once" | "once_per_bar_close" | "cooldown";
  cooldown_minutes: number | null;
  enabled: boolean;
}

/**
 * هر ۱۰ دقیقه: قوانین action (سیگنال جدید، جهش tension_index، مرگ پایپ‌لاین) را چک می‌کند
 * و در صورت trigger فوری به تلگرام می‌فرستد. قوانین info اینجا evaluate نمی‌شوند —
 * send-alert-digest جداگانه (ساعتی) آن‌ها را دایجست می‌کند.
 */
Deno.serve(async () => {
  const start = performance.now();
  const client = createServiceClient();
  const nowIso = new Date().toISOString();
  const fired: string[] = [];

  try {
    const { data: rulesRaw, error: rulesError } = await client
      .from("alert_rules")
      .select("id, name, condition, severity, fire_policy, cooldown_minutes, enabled")
      .eq("severity", "action")
      .eq("enabled", true);
    if (rulesError) throw rulesError;
    const rules = (rulesRaw ?? []) as RuleRow[];

    for (const rule of rules) {
      const { data: lastLog } = await client
        .from("alert_log")
        .select("fired_at")
        .eq("rule_id", rule.id)
        .order("fired_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastFiredAt = lastLog?.fired_at ?? null;

      if (rule.condition.type === "signal") {
        const sinceIso =
          lastFiredAt ?? new Date(Date.now() - SIGNAL_LOOKBACK_FALLBACK_MIN * 60_000).toISOString();
        const { data: newSignals } = await client
          .from("signals")
          .select("symbol, score, created_at")
          .eq("direction", rule.condition.direction)
          .gt("created_at", sinceIso)
          .order("created_at", { ascending: true });

        if (newSignals && newSignals.length > 0) {
          const message = formatSignalAlert(
            rule.condition.direction,
            newSignals.map((s) => ({ symbol: s.symbol, score: s.score })),
            SITE_URL,
          );
          const delivered = await sendTelegramMessage(message);
          await client.from("alert_log").insert({
            rule_id: rule.id,
            payload: { symbols: newSignals.map((s) => s.symbol) },
            delivered,
          });
          fired.push(rule.name);
        }
        continue;
      }

      if (!isCooldownElapsed(rule, lastFiredAt, nowIso)) continue;

      if (rule.condition.type === "tension_index") {
        const { data: latestTension } = await client
          .from("global_quotes")
          .select("price")
          .eq("asset", "tension_index")
          .order("captured_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const gaugeValue = latestTension?.price ?? null;

        if (tensionConditionMet(rule.condition, gaugeValue)) {
          const message = formatTensionAlert(gaugeValue!, SITE_URL);
          const delivered = await sendTelegramMessage(message);
          await client.from("alert_log").insert({ rule_id: rule.id, payload: { gaugeValue }, delivered });
          fired.push(rule.name);
        }
        continue;
      }

      if (rule.condition.type === "pipeline_health") {
        const sinceIso = lastFiredAt ?? new Date(Date.now() - 60 * 60_000).toISOString();
        const { data: errors } = await client
          .from("pipeline_health")
          .select("source")
          .eq("status", "error")
          .gt("checked_at", sinceIso);

        if (errors && errors.length > 0) {
          const sources = [...new Set(errors.map((e) => e.source as string))];
          const message = formatPipelineDownAlert(sources, SITE_URL);
          const delivered = await sendTelegramMessage(message);
          await client.from("alert_log").insert({ rule_id: rule.id, payload: { sources }, delivered });
          fired.push(rule.name);
        }
      }
    }

    const latencyMs = Math.round(performance.now() - start);
    await logHealth(client, "evaluate-alerts", "ok", `fired: ${fired.join(", ") || "none"}`, latencyMs);

    return new Response(JSON.stringify({ ok: true, fired }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    await logHealth(client, "evaluate-alerts", "error", message, latencyMs);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
