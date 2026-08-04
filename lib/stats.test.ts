import { describe, expect, it } from "vitest";
import {
  logReturns,
  pearsonCorrelation,
  rollingCorrelation,
  crossCorrelation,
  bestLag,
} from "./stats.ts";

describe("logReturns", () => {
  it("بازده لگاریتمی متوالی درست محاسبه می‌شود", () => {
    const r = logReturns([100, 110, 121]);
    expect(r.length).toBe(2);
    expect(r[0]).toBeCloseTo(Math.log(1.1), 10);
    expect(r[1]).toBeCloseTo(Math.log(1.1), 10);
  });

  it("قیمت نامعتبر (صفر/منفی) بازده صفر می‌دهد", () => {
    expect(logReturns([100, 0, 50])).toEqual([0, 0]);
  });
});

describe("pearsonCorrelation", () => {
  it("همبستگی خطی مثبت کامل = ۱", () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10);
  });

  it("همبستگی خطی منفی کامل = -۱", () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 10);
  });

  it("کمتر از ۲ نقطه یا واریانس صفر → null", () => {
    expect(pearsonCorrelation([1], [1])).toBeNull();
    expect(pearsonCorrelation([1, 1, 1], [1, 2, 3])).toBeNull();
  });
});

describe("rollingCorrelation", () => {
  it("قبل از پنجرهٔ اول null و بعدش همبستگی درست", () => {
    const a = [1, 2, 3, 4, 5];
    const b = [2, 4, 6, 8, 10];
    const r = rollingCorrelation(a, b, 3);
    expect(r).toEqual([null, null, 1, 1, 1]);
  });
});

describe("crossCorrelation و bestLag", () => {
  const leader = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  // follower در روز t برابر مقدار leader دو روز قبل است → leader دو روز جلوتر حرکت می‌کند
  const follower = [50, 51, 1, 2, 3, 4, 5, 6, 7, 8];

  it("در لگ +۲ همبستگی کامل است (leader دو روز جلوتر از follower)", () => {
    const ccf = crossCorrelation(leader, follower, 3);
    const atLag2 = ccf.find((p) => p.lag === 2)!;
    expect(atLag2.correlation).toBeCloseTo(1, 10);
    expect(atLag2.n).toBe(8);
  });

  it("bestLag همان لگ +۲ را به‌عنوان قوی‌ترین برمی‌گرداند", () => {
    const ccf = crossCorrelation(leader, follower, 3);
    expect(bestLag(ccf)!.lag).toBe(2);
  });

  it("تعداد نقاط خروجی برابر ۲×maxLag+۱ است", () => {
    const ccf = crossCorrelation(leader, follower, 3);
    expect(ccf.length).toBe(7);
  });
});
