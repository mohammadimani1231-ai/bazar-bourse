import { z } from "zod";
import { ConfidenceLevel } from "./briefSchema.ts";

const KeyPointSchema = z.object({
  point: z.string().min(1),
  confidence: ConfidenceLevel,
  ref: z.string().min(1),
});

export const WeeklySummarySchema = z.object({
  summary: z.string().min(1),
  key_points: z.array(KeyPointSchema),
});

export type WeeklySummary = z.infer<typeof WeeklySummarySchema>;

export type ParseWeeklySummaryResult =
  | { success: true; data: WeeklySummary }
  | { success: false; error: string };

/** خلاصهٔ اجرایی گزارش هفتگی — همان قواعد سخت فاز ۶ (اطمینان + ref)، فقط بدون فرمت market_mood/signal_review. */
export function parseWeeklySummaryResponse(raw: string): ParseWeeklySummaryResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return { success: false, error: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const result = WeeklySummarySchema.safeParse(json);
  if (!result.success) {
    return { success: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { success: true, data: result.data };
}
