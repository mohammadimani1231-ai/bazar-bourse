import { describe, expect, it } from "vitest";
import { dailyPctChanges, zScore, coinBubblePct, computeTensionIndex } from "./tension.ts";

describe("dailyPctChanges", () => {
  it("درصد تغییر روزانه درست حساب می‌شود", () => {
    expect(dailyPctChanges([100, 110, 99])).toEqual([10, -10]);
  });
});

describe("zScore", () => {
  it("نمونهٔ کوچک‌تر از ۱۰ → null", () => {
    expect(zScore(5, [1, 2, 3])).toBeNull();
  });

  it("واریانس صفر → null", () => {
    expect(zScore(5, new Array(10).fill(3))).toBeNull();
  });

  it("مقدار میانگین → z نزدیک صفر", () => {
    const series = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const mean = 5.5;
    expect(zScore(mean, series)).toBeCloseTo(0, 5);
  });

  /**
   * sanity-check تاریخی واقعی (طبق DoD فاز ۵): بزرگ‌ترین جهش روزانهٔ واقعی دلار آزاد در
   * benchmark_candles (۲۰۲۵-۰۶-۲۵، افت ۱۱.۳۲٪ از ۹۳۶٬۰۰۰ به ۸۳۰٬۰۰۰ — یک رویداد تنشی واقعی
   * در دادهٔ پروژه) باید z-score بسیار بالایی نسبت به توزیع ۹۰ روز قبلش بدهد.
   */
  it("جهش واقعی دلار در ۲۰۲۵-۰۶-۲۵ (افت ۱۱.۳۲٪) z-score بسیار بالایی می‌دهد", () => {
    const closesBefore = [
      919200, 939500, 956000, 986000, 984000, 982500, 1026000, 1026000, 1031000, 1045000, 1046000,
      1037000, 1033000, 1032000, 1030000, 1050000, 1039000, 1028000, 1045500, 1058000, 999000,
      999000, 1005000, 994000, 947000, 850000, 895000, 880000, 880000, 853000, 849500, 829000,
      831000, 819500, 813500, 810500, 800000, 796000, 829500, 833000, 809000, 809000, 814000,
      849000, 850500, 852000, 862500, 843500, 823500, 821500, 840000, 820000, 834500, 831000,
      836000, 836000, 832000, 829500, 830000, 824000, 817500, 818500, 841500, 825000, 828500,
      832500, 828500, 824000, 822500, 828500, 824500, 824000, 828000, 825500, 821500, 826000,
      825500, 835000, 835500, 818500, 823500, 825000, 819500, 829000, 840500, 935000, 955000,
      927000, 929000, 936000,
    ];
    const prevClose = 936000;
    const spikeClose = 830000;

    const absChanges = dailyPctChanges(closesBefore).map(Math.abs);
    const spikeAbsChange = Math.abs(((spikeClose - prevClose) / prevClose) * 100);
    const z = zScore(spikeAbsChange, absChanges);

    expect(z).not.toBeNull();
    expect(z!).toBeGreaterThan(3); // به‌وضوح یک outlier آماری، نه نوسان عادی
  });
});

describe("coinBubblePct", () => {
  it("محاسبهٔ حباب با مقادیر واقعی", () => {
    // انس=۲۰۰۰دلار، دلار=۹۰۰هزارریال → هرگرم=۲۰۰۰*۹۰۰۰۰۰/۳۱.۱۰۳۵≈۵۷,۸۸۶,۰۰۰ ریال
    // ارزش ذاتی سکه = ۵۷,۸۸۶,۰۰۰ * ۸.۱۳۳ * ۰.۹ ≈ ۴۲۳,۶۴۰,۰۰۰ ریال
    const bubble = coinBubblePct(500_000_000, 2000, 900_000);
    expect(bubble).not.toBeNull();
    expect(bubble!).toBeGreaterThan(0); // قیمت بازار بالاتر از ارزش ذاتی
  });

  it("ورودی ناقص → null", () => {
    expect(coinBubblePct(null, 2000, 900_000)).toBeNull();
    expect(coinBubblePct(500_000_000, null, 900_000)).toBeNull();
  });
});

describe("computeTensionIndex", () => {
  it("همهٔ مؤلفه‌ها null → نتیجه null", () => {
    const result = computeTensionIndex({ usdVolatilityZ: null, coinBubblePct: null, brentChangeZ: null });
    expect(result.rawScore).toBeNull();
    expect(result.gaugeValue).toBeNull();
  });

  it("مقادیر خنثی (صفر) → gauge نزدیک ۵۰", () => {
    const result = computeTensionIndex({ usdVolatilityZ: 0, coinBubblePct: 0, brentChangeZ: 0 });
    expect(result.gaugeValue).toBeCloseTo(50, 5);
  });

  it("مؤلفه‌های تنشی بالا → gauge بالا (کلمپ‌شده به ۱۰۰)", () => {
    const result = computeTensionIndex({ usdVolatilityZ: 5, coinBubblePct: 40, brentChangeZ: 4 });
    expect(result.gaugeValue).toBe(100);
  });

  it("فقط یک مؤلفه موجود بود، بقیه null — نادیده گرفته می‌شوند نه صفر فرض", () => {
    const onlyUsd = computeTensionIndex({ usdVolatilityZ: 3, coinBubblePct: null, brentChangeZ: null });
    expect(onlyUsd.rawScore).toBeCloseTo(3, 5);
  });
});
