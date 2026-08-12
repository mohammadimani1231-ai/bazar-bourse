import { describe, expect, it } from "vitest";
import { buildRuleReviewReport, MIN_APPEARANCES_FOR_REVIEW, type ReviewTradeInput } from "./ruleReview.ts";
import type { OutcomeLabel } from "./outcomeLabels.ts";

function trades(
  count: number,
  rule: string,
  returnPct: number,
  label: OutcomeLabel,
): ReviewTradeInput[] {
  return Array.from({ length: count }, () => ({
    reasons: [{ rule, triggered: true }],
    returnPct,
    label,
  }));
}

const NOW = "2026-08-12T00:00:00Z";

describe("گیت آماری (هم‌ارز MIN_TRIGGERS_TO_TUNE بک‌تست)", () => {
  it("قانون با حضور کمتر از حد، هیچ پیشنهادی نمی‌گیرد", () => {
    const report = buildRuleReviewReport(trades(MIN_APPEARANCES_FOR_REVIEW - 1, "rsi_oversold", -5, "rule_failed_no_shock"), NOW);
    const row = report.rows.find((r) => r.rule === "rsi_oversold")!;
    expect(row.adequateSample).toBe(false);
    expect(row.suggestion).toContain("دادهٔ کافی نیست");
    expect(row.suggestion).not.toContain("کاهش وزن");
  });

  it("دقیقاً در حد آستانه، نمونه کافی شمرده می‌شود", () => {
    const report = buildRuleReviewReport(trades(MIN_APPEARANCES_FOR_REVIEW, "rsi_oversold", -5, "rule_failed_no_shock"), NOW);
    expect(report.rows[0].adequateSample).toBe(true);
  });
});

describe("جهت پیشنهاد", () => {
  it("شکست مکرر بدون شوک → کاندید کاهش وزن (فقط پیشنهاد)", () => {
    const report = buildRuleReviewReport(trades(30, "ema_cross_up", -5, "rule_failed_no_shock"), NOW);
    expect(report.rows[0].suggestion).toContain("کاهش وزن");
    expect(report.rows[0].suggestion).toContain("تصمیم با شماست");
  });

  it("برد مکرر → کاندید افزایش وزن", () => {
    const report = buildRuleReviewReport(trades(30, "money_inflow_3d", 8, "rule_worked"), NOW);
    expect(report.rows[0].suggestion).toContain("افزایش وزن");
  });

  it("اکثریت شوک بیرونی → تقصیر گردن قانون انداخته نمی‌شود", () => {
    const report = buildRuleReviewReport(trades(30, "near_52w_high", -5, "external_shock"), NOW);
    expect(report.rows[0].suggestion).toContain("شرایط بیرونی");
    expect(report.rows[0].suggestion).not.toContain("کاهش وزن");
  });

  it("اکثریت ریزساختار → اول محدودیت اجرا بررسی شود، نه کیفیت قانون", () => {
    const report = buildRuleReviewReport(trades(30, "buyer_power_strong", -5, "microstructure_limit"), NOW);
    expect(report.rows[0].suggestion).toContain("محدودیت اجرا");
  });
});

describe("حاکمیت (قید #۱۴)", () => {
  it("هیچ عدد وزن پیشنهادی در خروجی نیست — فقط جهت بررسی", () => {
    const report = buildRuleReviewReport(trades(30, "ema_cross_up", -5, "rule_failed_no_shock"), NOW);
    // اگر روزی کسی وزن عددی اضافه کند، این تست عمداً می‌شکند
    expect(report.rows[0]).not.toHaveProperty("suggestedWeight");
    expect(report.rows[0]).not.toHaveProperty("newWeight");
  });

  it("سلب مسئولیت همیشه در خروجی هست", () => {
    const report = buildRuleReviewReport([], NOW);
    expect(report.disclaimer).toContain("هیچ تغییری");
    expect(report.disclaimer).toContain("#۱۴");
  });
});

describe("موارد مرزی", () => {
  it("معاملات بازنشده/بسته‌نشده در آمار شمرده نمی‌شوند", () => {
    const report = buildRuleReviewReport(
      [
        ...trades(5, "rsi_oversold", 3, "rule_worked"),
        { reasons: [{ rule: "rsi_oversold", triggered: true }], returnPct: null, label: "microstructure_limit" },
      ],
      NOW,
    );
    expect(report.totalTradesConsidered).toBe(5);
    expect(report.rows[0].count).toBe(5);
  });

  it("قانون trigger نشده در آمار آن معامله نمی‌آید", () => {
    const report = buildRuleReviewReport(
      [{ reasons: [{ rule: "a", triggered: true }, { rule: "b", triggered: false }], returnPct: 4, label: "rule_worked" }],
      NOW,
    );
    expect(report.rows.map((r) => r.rule)).toEqual(["a"]);
  });

  it("ورودی خالی کرش نمی‌کند", () => {
    const report = buildRuleReviewReport([], NOW);
    expect(report.rows).toEqual([]);
    expect(report.totalTradesConsidered).toBe(0);
  });
});
