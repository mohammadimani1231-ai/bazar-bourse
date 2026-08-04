import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { sendTelegramMessage } from "../_shared/telegram.ts";
import { formatDigest, type DigestGroup } from "../../../lib/alertFormat.ts";
import type { AlertCondition } from "../../../lib/alertEngine.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://bazar-bourse.vercel.app";
const DIGEST_LOOKBACK_FALLBACK_MIN = 70; // کمی بیشتر از ۱ساعته، برای اطمینان از پوشش کامل بازهٔ کرون

interface RuleRow {
  id: number;
  name: string;
  condition: AlertCondition;
}

/**
 * ساعتی: همهٔ قوانین severity='info' (حجم مشکوک، پول درشت، کد به کد) را با هم evaluate
 * می‌کند و در **یک** پیام تلگرام دایجست می‌کند — نه یک پیام جداگانه به ازای هر قانون
 * (طبق طراحی ضد نویز پرامپت فاز ۵).
 */
Deno.serve(async () => {
  const start = performance.now();
  const client = createServiceClient();
  const nowIso = new Date().toISOString();

  try {
    const { data: rulesRaw, error: rulesError } = await client
      .from("alert_rules")
      .select("id, name, condition")
      .eq("severity", "info")
      .eq("enabled", true);
    if (rulesError) throw rulesError;
    const rules = (rulesRaw ?? []) as RuleRow[];

    const groups: DigestGroup[] = [];
    const ruleIdsWithData: number[] = [];

    for (const rule of rules) {
      if (rule.condition.type !== "tabloo_metric") continue;
      const metric = rule.condition.metric;

      const { data: lastLog } = await client
        .from("alert_log")
        .select("fired_at")
        .eq("rule_id", rule.id)
        .order("fired_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const sinceIso =
        lastLog?.fired_at ?? new Date(Date.now() - DIGEST_LOOKBACK_FALLBACK_MIN * 60_000).toISOString();

      const { data: rows } = await client
        .from("tabloo_metrics")
        .select("symbol")
        .eq("metric", metric)
        .eq("value", 1)
        .gt("captured_at", sinceIso);

      const symbols = [...new Set((rows ?? []).map((r) => r.symbol as string))];
      groups.push({ metric, label: metricLabel(metric), symbols });
      if (symbols.length > 0) ruleIdsWithData.push(rule.id);
    }

    const message = formatDigest(groups, SITE_URL);
    let delivered = false;
    if (message) {
      delivered = await sendTelegramMessage(message);
    }

    // برای هر قانونی که دیتا داشت (چه ارسال موفق بود چه نه) watermark را جلو می‌بریم تا
    // دور بعد همان symbolها را دوباره نشمارد — اگر ارسال fail شد هم مشکلی نیست، این‌ها info‌اند.
    if (ruleIdsWithData.length > 0) {
      await client.from("alert_log").insert(
        ruleIdsWithData.map((ruleId) => ({
          rule_id: ruleId,
          payload: { digestSentAt: nowIso },
          delivered,
        })),
      );
    }

    const latencyMs = Math.round(performance.now() - start);
    await logHealth(client, "send-alert-digest", "ok", message ? "sent" : "nothing to digest", latencyMs);

    return new Response(JSON.stringify({ ok: true, sent: !!message }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const errMessage = err instanceof Error ? err.message : JSON.stringify(err);
    await logHealth(client, "send-alert-digest", "error", errMessage, latencyMs);
    return new Response(JSON.stringify({ ok: false, error: errMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

function metricLabel(metric: string): string {
  switch (metric) {
    case "suspicious_volume":
      return "حجم مشکوک";
    case "whale":
      return "پول درشت";
    case "code_to_code":
      return "کد به کد";
    default:
      return metric;
  }
}
