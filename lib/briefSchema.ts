import { z } from "zod";

// طبق قاعدهٔ سخت system prompt: "[قطعی از داده] / [استنتاج قوی] / [گمانه]" — ممکن است مدل
// با یا بدون کروشه بنویسد، هر دو را می‌پذیریم.
function stripBrackets(val: unknown): unknown {
  return typeof val === "string" ? val.replace(/^\[|\]$/g, "").trim() : val;
}

// export می‌شود چون lib/weeklyBriefSchema.ts (فاز ۷) هم به همین سطوح اطمینان نیاز دارد —
// طبق قاعدهٔ «بدون پیاده‌سازی موازی»
export const ConfidenceLevel = z.preprocess(stripBrackets, z.enum(["قطعی از داده", "استنتاج قوی", "گمانه"]));
const MarketMood = z.enum(["مثبت", "خنثی", "منفی"]);
const SignalVerdict = z.enum(["هم‌راستا", "خلاف زمینه"]);

const SectorNoteSchema = z.object({
  sector: z.string().min(1),
  view: z.string().min(1),
  confidence: ConfidenceLevel,
  ref: z.string().min(1),
});

const SignalReviewSchema = z.object({
  symbol: z.string().min(1),
  verdict: SignalVerdict,
  note: z.string().min(1),
  ref: z.string().min(1),
});

export const DailyBriefSchema = z.object({
  market_mood: MarketMood,
  summary: z.string().min(1),
  sector_notes: z.array(SectorNoteSchema),
  signal_review: z.array(SignalReviewSchema),
  main_risk: z.string().min(1),
});

export type DailyBrief = z.infer<typeof DailyBriefSchema>;

export type ParseBriefResult =
  | { success: true; data: DailyBrief }
  | { success: false; error: string };

/** خروجی خام Claude (رشتهٔ متنی) را پارس و طبق DailyBriefSchema اعتبارسنجی می‌کند. */
export function parseBriefResponse(raw: string): ParseBriefResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return { success: false, error: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const result = DailyBriefSchema.safeParse(json);
  if (!result.success) {
    return { success: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { success: true, data: result.data };
}
