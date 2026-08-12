import { describe, expect, it } from "vitest";
import {
  labelOutcome,
  maxTensionMoveInWindow,
  summarizeLabels,
  tensionSpikeThreshold,
  MIN_TENSION_SAMPLES,
  type OutcomeLabelInput,
  type TensionPoint,
} from "./outcomeLabels.ts";

/**
 * ۶۰ روز گِیج با نوسان روزانهٔ کوچکِ **متنوع** (نه ثابت — وگرنه پرسنتایل ۹۰ برابر یک روز
 * عادی می‌شود و تست بی‌معنا) و یک جهش بزرگ واقعی در روز ۴۰.
 */
function tensionHistory(): TensionPoint[] {
  const wobble = [0, 1, 2, 1, 3, 0, 2, 1];
  const points: TensionPoint[] = [];
  for (let i = 0; i < 60; i++) {
    const date = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
    points.push({ date, gaugeValue: 50 + wobble[i % wobble.length] + (i === 40 ? 25 : 0) });
  }
  return points;
}

function input(overrides: Partial<OutcomeLabelInput> = {}): OutcomeLabelInput {
  return {
    status: "closed",
    queueWaitDays: 0,
    pnl: -1000,
    entryDate: "2026-01-05",
    exitDate: "2026-01-20",
    ...overrides,
  };
}

describe("آستانهٔ پرسنتایلی (قید #۴ — نه عدد ثابت)", () => {
  it("آستانه از توزیع تاریخی خودِ گِیج ساخته می‌شود", () => {
    const t = tensionSpikeThreshold(tensionHistory());
    expect(t).not.toBeNull();
    expect(t!).toBeGreaterThan(0);
  });

  it("با نمونهٔ کمتر از حداقل، آستانه null است (نه عدد حدسی)", () => {
    const short = tensionHistory().slice(0, MIN_TENSION_SAMPLES - 1);
    expect(tensionSpikeThreshold(short)).toBeNull();
  });

  it("بیشترین جهش فقط داخل بازهٔ نگه‌داری شمرده می‌شود", () => {
    const h = tensionHistory();
    // جهش روز ۴۰ (۲۰۲۶-۰۲-۱۰) خارج از این بازه است
    expect(maxTensionMoveInWindow(h, "2026-01-05", "2026-01-20")).toBeLessThan(5);
    expect(maxTensionMoveInWindow(h, "2026-02-08", "2026-02-12")).toBeGreaterThan(20);
  });
});

describe("ترتیب اولویت برچسب‌ها", () => {
  it("ریزساختار بر همه‌چیز مقدم است — سفارش منقضی‌شدهٔ صف", () => {
    const r = labelOutcome(input({ status: "expired_queue", pnl: null }), tensionHistory());
    expect(r.label).toBe("microstructure_limit");
    expect(r.reason).toContain("منقضی");
  });

  it("اجرای با تأخیر صف هم ریزساختار است، حتی اگر سودده باشد", () => {
    const r = labelOutcome(input({ queueWaitDays: 2, pnl: 5000 }), tensionHistory());
    expect(r.label).toBe("microstructure_limit");
    expect(r.reason).toContain("2 روز");
  });

  it("دادهٔ کهنه هم ریزساختار شمرده می‌شود", () => {
    expect(labelOutcome(input({ status: "rejected_stale_data", pnl: null }), tensionHistory()).label).toBe(
      "microstructure_limit",
    );
  });

  it("شوک بیرونی وقتی جهش تنش در دورهٔ نگه‌داری باشد", () => {
    const r = labelOutcome(input({ entryDate: "2026-02-08", exitDate: "2026-02-12" }), tensionHistory());
    expect(r.label).toBe("external_shock");
    expect(r.reason).toContain("پرسنتایل");
  });

  it("زیان بدون جهش تنش = ضعف edge", () => {
    const r = labelOutcome(input(), tensionHistory());
    expect(r.label).toBe("rule_failed_no_shock");
    expect(r.reason).toContain("ضعف edge");
  });

  it("سود بدون جهش تنش = نتیجهٔ مثبت طبق قوانین", () => {
    expect(labelOutcome(input({ pnl: 5000 }), tensionHistory()).label).toBe("rule_worked");
  });

  it("زیان با pnl صفر هم ضعف edge است (هم‌ساز با قرارداد بک‌تست)", () => {
    expect(labelOutcome(input({ pnl: 0 }), tensionHistory()).label).toBe("rule_failed_no_shock");
  });
});

describe("نبود دادهٔ گِیج", () => {
  it("بدون تاریخچهٔ کافی، شوک بیرونی ادعا نمی‌شود و دلیلش صریح گفته می‌شود", () => {
    const r = labelOutcome(input({ entryDate: "2026-02-08", exitDate: "2026-02-12" }), []);
    expect(r.label).toBe("rule_failed_no_shock");
    expect(r.spikeThreshold).toBeNull();
    expect(r.reason).toContain("کافی نیست");
  });
});

describe("توزیع برچسب‌ها", () => {
  it("همهٔ کلیدها حتی با شمارش صفر حاضرند", () => {
    const counts = summarizeLabels(["rule_worked", "rule_worked", "external_shock"]);
    expect(counts).toEqual({
      rule_worked: 2,
      rule_failed_no_shock: 0,
      external_shock: 1,
      microstructure_limit: 0,
    });
  });
});
