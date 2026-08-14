import { describe, expect, it } from "vitest";
import {
  buyCost,
  sellProceeds,
  maxAffordableShares,
  decideBuyExecution,
  decideSellExecution,
  shouldExpirePending,
  realizedPnl,
  isQuoteFromToday,
  type VirtualExecutionInput,
  type SellExecutionInput,
} from "./virtualExecution.ts";

const BUY_FEE = 0.37;
const SELL_FEE = 1.38;

function baseInput(overrides: Partial<VirtualExecutionInput> = {}): VirtualExecutionInput {
  return {
    cash: 100_000_000,
    openPositionCount: 0,
    maxConcurrentPositions: 8,
    desiredShareCount: 1000,
    price: 10_000,
    buyFeePct: BUY_FEE,
    queue: { lockedBuy: false },
    ...overrides,
  };
}

function baseSellInput(overrides: Partial<SellExecutionInput> = {}): SellExecutionInput {
  return {
    shareCount: 1000,
    entryPrice: 10_000,
    exitPrice: 10_500,
    buyFeePct: BUY_FEE,
    sellFeePct: SELL_FEE,
    exitReason: "stop_loss",
    queue: { lockedSell: false },
    ...overrides,
  };
}

describe("کارمزد", () => {
  it("کارمزد خرید به هزینه اضافه می‌شود", () => {
    const { gross, fee, net } = buyCost(1000, 10_000, BUY_FEE);
    expect(gross).toBe(10_000_000);
    expect(fee).toBeCloseTo(37_000, 6);
    expect(net).toBeCloseTo(10_037_000, 6);
  });

  it("کارمزد فروش از دریافتی کم می‌شود", () => {
    const { gross, fee, net } = sellProceeds(1000, 10_000, SELL_FEE);
    expect(gross).toBe(10_000_000);
    expect(fee).toBeCloseTo(138_000, 6);
    expect(net).toBeCloseTo(9_862_000, 6);
  });

  it("معاملهٔ بدون تغییر قیمت به اندازهٔ کل کارمزد رفت‌وبرگشت زیان می‌دهد", () => {
    const { returnPct } = realizedPnl({
      shareCount: 1000,
      entryPrice: 10_000,
      exitPrice: 10_000,
      buyFeePct: BUY_FEE,
      sellFeePct: SELL_FEE,
    });
    // ۱.۷۵٪ کل، ولی چون مخرج «هزینهٔ خرید با کارمزد» است کمی کمتر از ۱.۷۵٪ درمی‌آید
    expect(returnPct).toBeCloseTo(-1.744, 2);
  });

  it("سود ناخالص کمتر از کارمزد، خالص را منفی می‌کند", () => {
    const { pnl } = realizedPnl({
      shareCount: 1000,
      entryPrice: 10_000,
      exitPrice: 10_100, // +۱٪ ناخالص، کمتر از ۱.۷۵٪ کارمزد
      buyFeePct: BUY_FEE,
      sellFeePct: SELL_FEE,
    });
    expect(pnl).toBeLessThan(0);
  });
});

describe("کمبود نقدینگی", () => {
  it("سقف تعداد سهم قابل خرید کارمزد را هم حساب می‌کند", () => {
    // بدون کارمزد ۱۰ سهم می‌شد؛ با کارمزد فقط ۹ سهم جا می‌شود
    expect(maxAffordableShares(100_370, 10_000, BUY_FEE)).toBe(10);
    expect(maxAffordableShares(100_000, 10_000, BUY_FEE)).toBe(9);
  });

  it("با نقد ناکافی، اندازهٔ سفارش کوچک می‌شود نه رد", () => {
    const decision = decideBuyExecution(baseInput({ cash: 5_000_000 }));
    expect(decision.status).toBe("partial");
    expect(decision.shareCount).toBe(498);
    expect(decision.totalCost).toBeLessThanOrEqual(5_000_000);
    expect(decision.note).toContain("کاهش");
  });

  it("با نقد صفر، سفارش رد می‌شود", () => {
    const decision = decideBuyExecution(baseInput({ cash: 0 }));
    expect(decision.status).toBe("rejected_liquidity");
    expect(decision.shareCount).toBe(0);
  });

  it("اگر اندازهٔ پوزیشن محاسبه‌شده صفر باشد، اجرا نمی‌شود", () => {
    const decision = decideBuyExecution(baseInput({ desiredShareCount: 0 }));
    expect(decision.status).toBe("rejected_liquidity");
  });

  it("نقد کافی → اجرای کامل با همان تعداد درخواستی", () => {
    const decision = decideBuyExecution(baseInput());
    expect(decision.status).toBe("executed");
    expect(decision.shareCount).toBe(1000);
    expect(decision.fee).toBeCloseTo(37_000, 6);
  });
});

describe("مدل صف", () => {
  it("قفل صف خرید → سفارش در انتظار، نه رد", () => {
    const decision = decideBuyExecution(baseInput({ queue: { lockedBuy: true } }));
    expect(decision.status).toBe("pending_queue");
    expect(decision.shareCount).toBe(0);
  });

  it("قفل صف قبل از نقدینگی بررسی می‌شود (برچسب گمراه‌کننده نده)", () => {
    const decision = decideBuyExecution(baseInput({ cash: 0, queue: { lockedBuy: true } }));
    expect(decision.status).toBe("pending_queue");
  });

  it("وضعیت نامعلوم صف (null) مانع اجرا نیست", () => {
    const decision = decideBuyExecution(baseInput({ queue: { lockedBuy: null } }));
    expect(decision.status).toBe("executed");
  });

  it("سفارش در انتظار دقیقاً بعد از N روز معاملاتی منقضی می‌شود", () => {
    expect(shouldExpirePending(2, 3)).toBe(false);
    expect(shouldExpirePending(3, 3)).toBe(true);
    expect(shouldExpirePending(4, 3)).toBe(true);
  });
});

describe("تصمیم اجرای خروج (decideSellExecution)", () => {
  it("صف فروش باز → بسته می‌شود با سود/زیان محاسبه‌شده", () => {
    const decision = decideSellExecution(baseSellInput());
    expect(decision.status).toBe("closed");
    const expected = realizedPnl({
      shareCount: 1000,
      entryPrice: 10_000,
      exitPrice: 10_500,
      buyFeePct: BUY_FEE,
      sellFeePct: SELL_FEE,
    });
    expect(decision.pnl).toBeCloseTo(expected.pnl, 6);
    expect(decision.returnPct).toBeCloseTo(expected.returnPct, 6);
    expect(decision.exitFee).toBeCloseTo(expected.exitFee, 6);
    expect(decision.sellNet).toBeCloseTo(sellProceeds(1000, 10_500, SELL_FEE).net, 6);
  });

  it("قفل صف فروش → اجرا نمی‌شود، نه رد قطعی (پوزیشن باز می‌ماند)", () => {
    const decision = decideSellExecution(baseSellInput({ queue: { lockedSell: true } }));
    expect(decision.status).toBe("blocked_locked_sell");
    expect(decision.pnl).toBeNull();
    expect(decision.sellNet).toBeNull();
    expect(decision.note).toContain("قفل صف فروش");
  });

  it("علت خروج در پیام مسدودشدن ذکر می‌شود", () => {
    const decision = decideSellExecution(baseSellInput({ queue: { lockedSell: true }, exitReason: "max_hold" }));
    expect(decision.note).toContain("max_hold");
  });

  it("وضعیت نامعلوم صف (null) مانع اجرا نیست", () => {
    const decision = decideSellExecution(baseSellInput({ queue: { lockedSell: null } }));
    expect(decision.status).toBe("closed");
  });
});

describe("تازگی کوت (گارد دادهٔ کهنه/تعطیلی)", () => {
  // ۰۸:۰۰ UTC وسط ساعات بازار است = ۱۱:۳۰ تهران همان روز
  const NOW = new Date("2026-08-15T08:00:00Z");

  it("کوت همان روز معاملاتی تازه است", () => {
    expect(isQuoteFromToday("2026-08-15T06:05:00Z", NOW)).toBe(true);
    expect(isQuoteFromToday("2026-08-15T07:59:00Z", NOW)).toBe(true);
  });

  it("کوت روز معاملاتی قبلی کهنه است (سناریوی تعطیلی ثبت‌نشده)", () => {
    expect(isQuoteFromToday("2026-08-14T09:20:00Z", NOW)).toBe(false);
  });

  it("کوت ماه‌ها قبل کهنه است (سناریوی نماد متوقف مثل فولاد)", () => {
    expect(isQuoteFromToday("2026-02-25T09:00:00Z", NOW)).toBe(false);
  });

  it("مرز روز بر اساس نیمه‌شب تهران است، نه نیمه‌شب UTC", () => {
    // ۲۰:۳۰ UTC روز ۰۸-۱۴ = ۰۰:۰۰ تهران روز ۰۸-۱۵ → همان روزِ NOW
    expect(isQuoteFromToday("2026-08-14T20:30:00Z", NOW)).toBe(true);
    // ۲۰:۲۹ UTC = ۲۳:۵۹ تهران روز ۰۸-۱۴ → روز قبل
    expect(isQuoteFromToday("2026-08-14T20:29:00Z", NOW)).toBe(false);
  });
});

describe("سقف پوزیشن هم‌زمان", () => {
  it("پر بودن ظرفیت قبل از هر چیز دیگری بررسی می‌شود", () => {
    const decision = decideBuyExecution(
      baseInput({ openPositionCount: 8, maxConcurrentPositions: 8, queue: { lockedBuy: true } }),
    );
    expect(decision.status).toBe("rejected_max_positions");
  });
});
