import { describe, expect, it } from "vitest";
import { ema, rsi, roc, ppo, distanceFrom52Week, atr } from "./indicators.ts";

// مقادیر مرجع با pandas (pandas.Series.ewm(adjust=False)) روی همین سری مستقل محاسبه شده‌اند —
// نه از حافظه، نه از همین پیاده‌سازی — تا واقعاً تست‌کنندهٔ درستی فرمول باشد.
const CLOSES = [
  100, 102, 101, 105, 107, 106, 108, 110, 109, 112, 115, 113, 116, 118, 117, 120, 122, 121, 125, 128,
];

function approxArray(actual: (number | null)[], expected: (number | null)[], precision = 4) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) => {
    if (expected[i] === null) {
      expect(v).toBeNull();
    } else {
      expect(v as number).toBeCloseTo(expected[i] as number, precision);
    }
  });
}

describe("ema", () => {
  it("با EMA5 محاسبه‌شده توسط pandas مطابقت دارد", () => {
    const expected = [
      100.0, 100.666667, 100.777778, 102.185185, 103.790123, 104.526749, 105.684499, 107.123,
      107.748666, 109.165778, 111.110518, 111.740346, 113.16023, 114.773487, 115.515658, 117.010439,
      118.673626, 119.449084, 121.299389, 123.532926,
    ];
    approxArray(ema(CLOSES, 5), expected);
  });

  it("اولین مقدار خروجی همیشه برابر اولین مقدار ورودی است (seed)", () => {
    expect(ema(CLOSES, 12)[0]).toBe(CLOSES[0]);
  });
});

describe("rsi", () => {
  it("با RSI14 محاسبه‌شده توسط pandas (روش Wilder) مطابقت دارد", () => {
    const expected: (number | null)[] = [
      null, null, null, null, null, null, null, null, null, null, null, null, null, null,
      85.439692, 86.916799, 87.805011, 84.708421, 86.725114, 88.003037,
    ];
    approxArray(rsi(CLOSES, 14), expected);
  });

  it("با سری کوتاه‌تر از period+1، همه null است", () => {
    const result = rsi(CLOSES.slice(0, 10), 14);
    expect(result.every((v) => v === null)).toBe(true);
  });

  it("سری کاملاً صعودی → RSI=100 (avg_loss=0، نه Infinity/NaN)", () => {
    const risingOnly = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = rsi(risingOnly, 14);
    expect(result[19]).toBe(100);
  });
});

describe("roc", () => {
  it("با ROC5 محاسبه‌شده توسط pandas مطابقت دارد", () => {
    const expected: (number | null)[] = [
      null, null, null, null, null, 6.0, 5.882353, 8.910891, 3.809524, 4.672897, 8.490566, 4.62963,
      5.454545, 8.256881, 4.464286, 4.347826, 7.964602, 4.310345, 5.932203, 9.401709,
    ];
    approxArray(roc(CLOSES, 5), expected);
  });

  it("قیمت مرجع صفر (نماد بسته/داده خراب) → null نه Infinity", () => {
    const withZero = [0, 10, 20, 30, 40, 50];
    expect(roc(withZero, 5)[5]).toBeNull();
  });
});

describe("ppo", () => {
  it("خط PPO با مقدار مرجع pandas مطابقت دارد", () => {
    const expected = [
      0.0, 0.159308, 0.202525, 0.550622, 0.971673, 1.209175, 1.53417, 1.921108, 2.121613, 2.477879,
      2.946472, 3.124108, 3.442789, 3.790471, 3.939769, 4.219027, 4.521289, 4.627905, 4.926761,
      5.296513,
    ];
    approxArray(ppo(CLOSES, 12, 26, 9).ppo, expected);
  });

  it("خط سیگنال با مقدار مرجع pandas مطابقت دارد", () => {
    const expected = [
      0.0, 0.031862, 0.065994, 0.16292, 0.32467, 0.501571, 0.708091, 0.950694, 1.184878, 1.443478,
      1.744077, 2.020083, 2.304624, 2.601794, 2.869389, 3.139316, 3.415711, 3.65815, 3.911872, 4.1888,
    ];
    approxArray(ppo(CLOSES, 12, 26, 9).signal, expected);
  });

  it("هیستوگرام = PPO - سیگنال (مقدار مرجع pandas)", () => {
    const expected = [
      0.0, 0.127447, 0.136531, 0.387702, 0.647003, 0.707604, 0.826079, 0.970414, 0.936735, 1.034401,
      1.202395, 1.104025, 1.138165, 1.188677, 1.07038, 1.079711, 1.105578, 0.969755, 1.014889,
      1.107712,
    ];
    approxArray(ppo(CLOSES, 12, 26, 9).histogram, expected);
  });
});

describe("atr", () => {
  // high/low مستقل از CLOSES بالا ساخته شدند (high=close+1.5, low=close-1.2) تا true range
  // مؤلفهٔ high-low واقعی هم داشته باشد نه فقط gap با کندل قبل. مقادیر مرجع با pandas
  // (tr.ewm(alpha=1/14, adjust=False, min_periods=14).mean()) مستقل محاسبه شده‌اند.
  const HIGHS = CLOSES.map((c) => c + 1.5);
  const LOWS = CLOSES.map((c) => c - 1.2);

  it("با ATR14 محاسبه‌شده توسط pandas مطابقت دارد", () => {
    const expected: (number | null)[] = [
      null, null, null, null, null, null, null, null, null, null, null, null, null, null,
      3.563485, 3.630379, 3.621066, 3.555275, 3.694184, 3.751743,
    ];
    approxArray(atr(HIGHS, LOWS, CLOSES, 14), expected);
  });

  it("با سری کوتاه‌تر از period+1، همه null است", () => {
    const result = atr(HIGHS.slice(0, 10), LOWS.slice(0, 10), CLOSES.slice(0, 10), 14);
    expect(result.every((v) => v === null)).toBe(true);
  });
});

describe("distanceFrom52Week", () => {
  it("فاصلهٔ درصدی از بیشینه/کمینهٔ بازهٔ اخیر را درست حساب می‌کند", () => {
    const highs = [110, 120, 130, 100];
    const lows = [90, 95, 80, 85];
    const result = distanceFrom52Week(117, highs, lows);
    expect(result.pctFromHigh).toBeCloseTo(((117 - 130) / 130) * 100, 6);
    expect(result.pctFromLow).toBeCloseTo(((117 - 80) / 80) * 100, 6);
  });

  it("فقط period روز آخر را در نظر می‌گیرد", () => {
    const highs = [1000, 110, 120];
    const lows = [1, 90, 95];
    const result = distanceFrom52Week(115, highs, lows, 2);
    expect(result.pctFromHigh).toBeCloseTo(((115 - 120) / 120) * 100, 6);
    expect(result.pctFromLow).toBeCloseTo(((115 - 90) / 90) * 100, 6);
  });

  it("با آرایهٔ خالی → null نه NaN/Infinity", () => {
    const result = distanceFrom52Week(100, [], []);
    expect(result.pctFromHigh).toBeNull();
    expect(result.pctFromLow).toBeNull();
  });
});
