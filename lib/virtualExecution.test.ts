import { describe, expect, it } from "vitest";
import {
  buyCost,
  sellProceeds,
  maxAffordableShares,
  decideBuyExecution,
  shouldExpirePending,
  realizedPnl,
  type VirtualExecutionInput,
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

describe("سقف پوزیشن هم‌زمان", () => {
  it("پر بودن ظرفیت قبل از هر چیز دیگری بررسی می‌شود", () => {
    const decision = decideBuyExecution(
      baseInput({ openPositionCount: 8, maxConcurrentPositions: 8, queue: { lockedBuy: true } }),
    );
    expect(decision.status).toBe("rejected_max_positions");
  });
});
