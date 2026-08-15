import { describe, expect, it } from "vitest";
import { evaluateSignal, type SignalContext, type SignalRule } from "./signal-engine.ts";

function baseContext(overrides: Partial<SignalContext> = {}): SignalContext {
  return {
    series: {},
    metrics: {},
    history: {},
    queueLocked: false,
    queueLockedSell: false,
    ...overrides,
  };
}

describe("evaluateSignal — threshold rules", () => {
  const rule: SignalRule = {
    name: "buyer_power_gt_2",
    definition: { type: "threshold", metric: "buyer_power", op: ">", value: 2 },
    weight: 15,
    enabled: true,
  };

  it("وقتی شرط برقرار است، وزن قانون به score اضافه می‌شود", () => {
    const ctx = baseContext({ metrics: { buyer_power: 3 } });
    const result = evaluateSignal([rule], ctx);
    expect(result.score).toBe(15);
    expect(result.reasons[0].triggered).toBe(true);
  });

  it("وقتی شرط برقرار نیست، سهمی به score اضافه نمی‌شود", () => {
    const ctx = baseContext({ metrics: { buyer_power: 1 } });
    expect(evaluateSignal([rule], ctx).score).toBe(0);
  });

  it("متریک مقدار boolean هم پشتیبانی می‌شود (true=1, false=0)", () => {
    const boolRule: SignalRule = {
      name: "suspicious_volume",
      definition: { type: "threshold", metric: "suspicious_volume", op: "==", value: 1 },
      weight: 10,
      enabled: true,
    };
    expect(evaluateSignal([boolRule], baseContext({ metrics: { suspicious_volume: true } })).score).toBe(10);
    expect(evaluateSignal([boolRule], baseContext({ metrics: { suspicious_volume: false } })).score).toBe(0);
  });

  it("قانون غیرفعال هرگز اجرا نمی‌شود حتی اگر شرطش برقرار باشد", () => {
    const disabled = { ...rule, enabled: false };
    const ctx = baseContext({ metrics: { buyer_power: 100 } });
    expect(evaluateSignal([disabled], ctx).score).toBe(0);
  });

  it("متریک null باعث triggered=false می‌شود، نه خطا", () => {
    const ctx = baseContext({ metrics: { buyer_power: null } });
    expect(evaluateSignal([rule], ctx).reasons[0].triggered).toBe(false);
  });
});

describe("evaluateSignal — cross rules", () => {
  const crossUp: SignalRule = {
    name: "ema_cross_up",
    definition: { type: "cross", fast: "EMA9", slow: "EMA26", direction: "up" },
    weight: 20,
    enabled: true,
  };

  it("کراس صعودی واقعی (دیروز پایین، امروز بالا) تشخیص داده می‌شود", () => {
    const ctx = baseContext({
      series: { EMA9: { previous: 99, current: 101 }, EMA26: { previous: 100, current: 100 } },
    });
    expect(evaluateSignal([crossUp], ctx).score).toBe(20);
  });

  it("وقتی از قبل بالا بوده (نه کراس تازه)، triggered نمی‌شود", () => {
    const ctx = baseContext({
      series: { EMA9: { previous: 102, current: 103 }, EMA26: { previous: 100, current: 100 } },
    });
    expect(evaluateSignal([crossUp], ctx).score).toBe(0);
  });

  it("کراس نزولی برای قانون جهت up تشخیص داده نمی‌شود", () => {
    const ctx = baseContext({
      series: { EMA9: { previous: 101, current: 99 }, EMA26: { previous: 100, current: 100 } },
    });
    expect(evaluateSignal([crossUp], ctx).score).toBe(0);
  });

  it("با سری ناقص (previous=null، نماد تازه)، triggered نمی‌شود نه خطا", () => {
    const ctx = baseContext({ series: { EMA9: { previous: null, current: 101 }, EMA26: { previous: 100, current: 100 } } });
    expect(evaluateSignal([crossUp], ctx).reasons[0].triggered).toBe(false);
  });
});

describe("evaluateSignal — streak rules", () => {
  const streak: SignalRule = {
    name: "money_inflow_3d",
    definition: { type: "streak", metric: "money_flow", op: ">", value: 0, days: 3 },
    weight: 20,
    enabled: true,
  };

  it("۳ روز متوالی ورود پول مثبت → triggered", () => {
    const ctx = baseContext({ history: { money_flow: [-5, 10, 20, 30] } });
    expect(evaluateSignal([streak], ctx).score).toBe(20);
  });

  it("اگر حتی یک روز از ۳ روز اخیر منفی باشد → triggered نمی‌شود", () => {
    const ctx = baseContext({ history: { money_flow: [10, -1, 30] } });
    expect(evaluateSignal([streak], ctx).score).toBe(0);
  });

  it("با تاریخچهٔ کوتاه‌تر از days لازم → triggered نمی‌شود", () => {
    const ctx = baseContext({ history: { money_flow: [10, 20] } });
    expect(evaluateSignal([streak], ctx).reasons[0].triggered).toBe(false);
  });
});

describe("evaluateSignal — آستانه‌ها و جهت", () => {
  const buyRule: SignalRule = {
    name: "always_buy",
    definition: { type: "threshold", metric: "x", op: ">", value: 0 },
    weight: 50,
    enabled: true,
  };
  const sellRule: SignalRule = {
    name: "always_sell",
    definition: { type: "threshold", metric: "x", op: ">", value: 0 },
    weight: -50,
    enabled: true,
  };

  it("score >= 40 در رژیم عادی → direction=buy", () => {
    const ctx = baseContext({ metrics: { x: 1 } });
    const result = evaluateSignal([buyRule], ctx, true);
    expect(result.direction).toBe("buy");
  });

  it("در رژیم غیرعادی آستانهٔ خرید +۶۰ می‌شود — ۵۰ دیگر کافی نیست", () => {
    const ctx = baseContext({ metrics: { x: 1 } });
    const result = evaluateSignal([buyRule], ctx, false);
    expect(result.direction).toBe("none");
    expect(result.score).toBe(50);
  });

  it("score <= -40 → direction=sell (مستقل از رژیم)", () => {
    const ctx = baseContext({ metrics: { x: 1 } });
    expect(evaluateSignal([sellRule], ctx, false).direction).toBe("sell");
  });

  it("score را در بازهٔ [-100, 100] کلمپ می‌کند", () => {
    const bigRule = { ...buyRule, weight: 500 };
    const ctx = baseContext({ metrics: { x: 1 } });
    expect(evaluateSignal([bigRule], ctx).score).toBe(100);
  });

  it("گیت صف: سیگنال خرید در نماد صف‌خریدقفل‌شده suppress می‌شود", () => {
    const ctx = baseContext({ metrics: { x: 1 }, queueLocked: true });
    const result = evaluateSignal([buyRule], ctx);
    expect(result.direction).toBe("none");
    expect(result.suppressed).toBe(true);
    expect(result.score).toBe(50); // score خودش دستکاری نمی‌شود، فقط جهت suppress می‌شود
  });

  it("گیت صف: سیگنال خرید در نماد صف‌فروش‌قفل‌شده هم suppress می‌شود (فشار فروش شدید)", () => {
    const ctx = baseContext({ metrics: { x: 1 }, queueLockedSell: true });
    const result = evaluateSignal([buyRule], ctx);
    expect(result.direction).toBe("none");
    expect(result.suppressed).toBe(true);
  });

  it("سیگنال فروش با قفل صف خرید/فروش suppress نمی‌شود (گیت فقط برای خرید است)", () => {
    const ctx = baseContext({ metrics: { x: 1 }, queueLocked: true, queueLockedSell: true });
    const result = evaluateSignal([sellRule], ctx);
    expect(result.direction).toBe("sell");
    expect(result.suppressed).toBe(false);
  });

  it("reasons شامل تفکیک کامل هر قانون است (نه جعبه‌سیاه)", () => {
    const ctx = baseContext({ metrics: { x: 1 } });
    const result = evaluateSignal([buyRule, sellRule], ctx);
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons.map((r) => r.rule)).toEqual(["always_buy", "always_sell"]);
  });
});
