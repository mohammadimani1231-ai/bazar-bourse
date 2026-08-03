import { describe, expect, it } from "vitest";
import {
  perCapitaBuy,
  perCapitaSell,
  buyerPower,
  moneyFlow,
  moneyFlowByIndustry,
  isSuspiciousVolume,
  isWhaleBuyer,
  isCodeToCode,
  queueState,
  queueVelocity,
  marketPerCapita,
  detectCrossovers,
} from "./tabloo.ts";

describe("perCapitaBuy / perCapitaSell", () => {
  it("سرانه خرید را از buy_i_volume × close_price ÷ buy_count_i حساب می‌کند", () => {
    expect(perCapitaBuy({ buy_i_volume: 1000, close_price: 500, buy_count_i: 10 })).toBe(50000);
  });

  it("وقتی buy_count_i صفر است null برمی‌گرداند نه Infinity", () => {
    expect(perCapitaBuy({ buy_i_volume: 1000, close_price: 500, buy_count_i: 0 })).toBeNull();
  });

  it("وقتی buy_i_volume صفر است (نه null) عدد صفر برمی‌گرداند", () => {
    expect(perCapitaBuy({ buy_i_volume: 0, close_price: 500, buy_count_i: 10 })).toBe(0);
  });

  it("وقتی هر فیلدی null است null برمی‌گرداند — نماد بسته/بدون معامله", () => {
    expect(perCapitaBuy({ buy_i_volume: null, close_price: 500, buy_count_i: 10 })).toBeNull();
    expect(perCapitaSell({ sell_i_volume: 1000, close_price: null, sell_count_i: 10 })).toBeNull();
    expect(perCapitaSell({ sell_i_volume: 1000, close_price: 500, sell_count_i: null })).toBeNull();
  });
});

describe("buyerPower", () => {
  it("سرانه خرید ÷ سرانه فروش را برمی‌گرداند", () => {
    expect(buyerPower(100, 50)).toBe(2);
  });

  it("گارد تقسیم بر صفر: سرانه فروش صفر → null", () => {
    expect(buyerPower(100, 0)).toBeNull();
  });

  it("وقتی هرکدام null باشد → null", () => {
    expect(buyerPower(null, 50)).toBeNull();
    expect(buyerPower(100, null)).toBeNull();
  });
});

describe("moneyFlow", () => {
  it("(buy_i_volume - sell_i_volume) × close_price را حساب می‌کند", () => {
    expect(moneyFlow({ buy_i_volume: 1000, sell_i_volume: 400, close_price: 10 })).toBe(6000);
  });

  it("می‌تواند منفی باشد (خروج پول)", () => {
    expect(moneyFlow({ buy_i_volume: 400, sell_i_volume: 1000, close_price: 10 })).toBe(-6000);
  });

  it("با فیلد null → null", () => {
    expect(moneyFlow({ buy_i_volume: null, sell_i_volume: 1000, close_price: 10 })).toBeNull();
  });
});

describe("moneyFlowByIndustry", () => {
  it("ورود/خروج پول را به تفکیک صنعت تجمیع می‌کند", () => {
    const industryOf = new Map([
      ["خودرو", "خودرو و ساخت قطعات"],
      ["خساپا", "خودرو و ساخت قطعات"],
      ["فملی", "فلزات اساسی"],
    ]);
    const rows = [
      { symbol: "خودرو", moneyFlow: 100 },
      { symbol: "خساپا", moneyFlow: 200 },
      { symbol: "فملی", moneyFlow: -50 },
    ];
    expect(moneyFlowByIndustry(rows, industryOf)).toEqual({
      "خودرو و ساخت قطعات": 300,
      "فلزات اساسی": -50,
    });
  });

  it("ردیف‌های moneyFlow=null را نادیده می‌گیرد", () => {
    const industryOf = new Map([["خودرو", "خودرو و ساخت قطعات"]]);
    const rows = [
      { symbol: "خودرو", moneyFlow: 100 },
      { symbol: "خساپا", moneyFlow: null },
    ];
    expect(moneyFlowByIndustry(rows, industryOf)).toEqual({ "خودرو و ساخت قطعات": 100 });
  });
});

describe("isSuspiciousVolume", () => {
  it("وقتی حجم امروز از هر دو میانگین (۳ ماهه و ۲×۱۲ماهه) بیشتر است → true", () => {
    const last3m = Array(60).fill({ volume: 100 });
    const last12m = Array(240).fill({ volume: 100 });
    const result = isSuspiciousVolume(300, last3m, last12m);
    expect(result.suspicious).toBe(true);
    expect(result.avg3m).toBe(100);
    expect(result.avg12m).toBe(100);
  });

  it("وقتی فقط از میانگین ۳ ماهه بیشتر است ولی از ۲×۱۲ماهه نه → false", () => {
    const last3m = Array(60).fill({ volume: 100 });
    const last12m = Array(240).fill({ volume: 100 });
    expect(isSuspiciousVolume(150, last3m, last12m).suspicious).toBe(false);
  });

  it("با آرایه خالی (نماد تازه/بدون تاریخچه) → suspicious=null نه false گمراه‌کننده", () => {
    const result = isSuspiciousVolume(1000, [], []);
    expect(result.suspicious).toBeNull();
    expect(result.avg3m).toBeNull();
  });

  it("حجم صفر امروز → suspicious=false (نه null، چون میانگین‌ها موجودند)", () => {
    const last3m = Array(60).fill({ volume: 100 });
    const last12m = Array(240).fill({ volume: 100 });
    expect(isSuspiciousVolume(0, last3m, last12m).suspicious).toBe(false);
  });
});

describe("isWhaleBuyer", () => {
  it("سرانه بالای پرسنتایل ۹۰ توزیع ۳۰ روزه → true", () => {
    const distribution = Array.from({ length: 30 }, (_, i) => i + 1); // 1..30
    const result = isWhaleBuyer(29.5, distribution);
    expect(result.isWhale).toBe(true);
    expect(result.sampleSize).toBe(30);
  });

  it("سرانه زیر پرسنتایل ۹۰ → false", () => {
    const distribution = Array.from({ length: 30 }, (_, i) => i + 1);
    expect(isWhaleBuyer(5, distribution).isWhale).toBe(false);
  });

  it("با نمونه کوچک‌تر از حد آستانه → isWhale=null (داده ناکافی، نه false)", () => {
    const result = isWhaleBuyer(100, [10, 20]);
    expect(result.isWhale).toBeNull();
    expect(result.percentile90).toBeNull();
  });

  it("مقادیر null داخل توزیع را قبل از محاسبه فیلتر می‌کند", () => {
    const distribution = [...Array.from({ length: 10 }, (_, i) => i + 1), null, null];
    const result = isWhaleBuyer(9.5, distribution);
    expect(result.sampleSize).toBe(10);
  });
});

describe("isCodeToCode", () => {
  it("وقتی حقیقی>۵۰٪ خرید و حقوقی>۵۰٪ فروش → true", () => {
    expect(isCodeToCode({ buy_i_volume: 600, sell_n_volume: 600, volume: 1000 })).toBe(true);
  });

  it("وقتی شرط برقرار نیست → false", () => {
    expect(isCodeToCode({ buy_i_volume: 400, sell_n_volume: 600, volume: 1000 })).toBe(false);
  });

  it("حجم صفر (نماد بسته) → null نه false گمراه‌کننده", () => {
    expect(isCodeToCode({ buy_i_volume: 0, sell_n_volume: 0, volume: 0 })).toBeNull();
  });
});

describe("queueState", () => {
  it("locked_buy وقتی bid1_price برابر سقف مجاز روز است", () => {
    const state = queueState({ bid1_price: 500, price_max: 500, bid1_volume: 10, base_volume: 100 });
    expect(state.lockedBuy).toBe(true);
  });

  it("heavy وقتی bid1_volume >= base_volume", () => {
    const state = queueState({ bid1_price: 480, price_max: 500, bid1_volume: 100, base_volume: 100 });
    expect(state.heavy).toBe(true);
  });

  it("با فیلدهای null → null نه false گمراه‌کننده", () => {
    const state = queueState({ bid1_price: null, price_max: 500, bid1_volume: null, base_volume: 100 });
    expect(state.lockedBuy).toBeNull();
    expect(state.heavy).toBeNull();
  });
});

describe("queueVelocity", () => {
  it("تغییر حجم صف خرید/فروش بین دو اسنپ‌شات متوالی را حساب می‌کند", () => {
    const previous = { bid1_volume: 1000, ask1_volume: 500, captured_at: "2026-08-03T05:30:00.000Z" };
    const current = { bid1_volume: 1500, ask1_volume: 400, captured_at: "2026-08-03T05:32:00.000Z" };
    const velocity = queueVelocity(current, previous);

    expect(velocity.bidVolumeChange).toBe(500);
    expect(velocity.askVolumeChange).toBe(-100);
    expect(velocity.secondsBetween).toBe(120);
  });
});

describe("marketPerCapita", () => {
  it("سرانه تجمیعی بازار را از مجموع ارزش ÷ مجموع تعداد کد حساب می‌کند", () => {
    const rows = [
      { buy_i_volume: 100, sell_i_volume: 50, buy_count_i: 2, sell_count_i: 1, close_price: 10 },
      { buy_i_volume: 200, sell_i_volume: 150, buy_count_i: 3, sell_count_i: 2, close_price: 10 },
    ];
    // buyValueSum = 1000+2000=3000, buyCountSum=5 -> 600
    // sellValueSum = 500+1500=2000, sellCountSum=3 -> 666.67
    const result = marketPerCapita(rows);
    expect(result.buyPerCapita).toBe(600);
    expect(result.sellPerCapita).toBeCloseTo(666.67, 1);
  });

  it("با آرایه خالی → هر دو null", () => {
    const result = marketPerCapita([]);
    expect(result.buyPerCapita).toBeNull();
    expect(result.sellPerCapita).toBeNull();
  });
});

describe("detectCrossovers", () => {
  it("لحظه‌ای که سرانه خرید از فروش عبور می‌کند را تشخیص می‌دهد", () => {
    const series = [
      { capturedAt: "2026-08-03T05:30:00.000Z", buyPerCapita: 10, sellPerCapita: 20 },
      { capturedAt: "2026-08-03T05:32:00.000Z", buyPerCapita: 15, sellPerCapita: 18 },
      { capturedAt: "2026-08-03T05:34:00.000Z", buyPerCapita: 25, sellPerCapita: 20 },
    ];
    const events = detectCrossovers(series);
    expect(events).toHaveLength(1);
    expect(events[0].direction).toBe("buy_over_sell");
    expect(events[0].capturedAt).toBe("2026-08-03T05:34:00.000Z");
  });

  it("ترتیب نامرتب ورودی را قبل از تشخیص مرتب می‌کند", () => {
    const series = [
      { capturedAt: "2026-08-03T05:34:00.000Z", buyPerCapita: 25, sellPerCapita: 20 },
      { capturedAt: "2026-08-03T05:30:00.000Z", buyPerCapita: 10, sellPerCapita: 20 },
    ];
    expect(detectCrossovers(series)).toHaveLength(1);
  });

  it("بدون کراس → آرایه خالی", () => {
    const series = [
      { capturedAt: "2026-08-03T05:30:00.000Z", buyPerCapita: 10, sellPerCapita: 20 },
      { capturedAt: "2026-08-03T05:32:00.000Z", buyPerCapita: 12, sellPerCapita: 22 },
    ];
    expect(detectCrossovers(series)).toHaveLength(0);
  });

  it("نقاط با مقدار null را نادیده می‌گیرد", () => {
    const series = [
      { capturedAt: "2026-08-03T05:30:00.000Z", buyPerCapita: 10, sellPerCapita: 20 },
      { capturedAt: "2026-08-03T05:32:00.000Z", buyPerCapita: null, sellPerCapita: null },
      { capturedAt: "2026-08-03T05:34:00.000Z", buyPerCapita: 25, sellPerCapita: 20 },
    ];
    expect(detectCrossovers(series)).toHaveLength(1);
  });
});
