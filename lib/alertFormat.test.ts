import { describe, expect, it } from "vitest";
import { formatSignalAlert, formatTensionAlert, formatPipelineDownAlert, formatDigest } from "./alertFormat.ts";

const SITE = "https://bazar-bourse.vercel.app";

describe("formatSignalAlert", () => {
  it("چند نماد هم‌جهت در یک پیام گروه‌بندی می‌شوند", () => {
    const msg = formatSignalAlert("buy", [{ symbol: "فملی", score: 55 }, { symbol: "خودرو", score: 42 }], SITE);
    expect(msg).toContain("خرید جدید (2)");
    expect(msg).toContain("فملی");
    expect(msg).toContain("خودرو");
    expect(msg).toContain(`${SITE}/symbol/`);
  });

  it("جهت فروش برچسب درست می‌گیرد", () => {
    const msg = formatSignalAlert("sell", [{ symbol: "خساپا", score: -45 }], SITE);
    expect(msg).toContain("فروش جدید (1)");
  });
});

describe("formatTensionAlert و formatPipelineDownAlert", () => {
  it("مقدار گیج و لینک site را دارد", () => {
    expect(formatTensionAlert(82.4, SITE)).toContain("82");
    expect(formatTensionAlert(82.4, SITE)).toContain(SITE);
  });

  it("لینک صفحهٔ health را دارد", () => {
    expect(formatPipelineDownAlert(["collect-tse"], SITE)).toContain(`${SITE}/health`);
  });
});

describe("formatDigest", () => {
  it("گروه‌های خالی حذف می‌شوند", () => {
    const msg = formatDigest(
      [
        { metric: "whale", label: "پول درشت", symbols: ["فملی"] },
        { metric: "code_to_code", label: "کد به کد", symbols: [] },
      ],
      SITE,
    );
    expect(msg).toContain("پول درشت");
    expect(msg).not.toContain("کد به کد");
  });

  it("همه گروه‌ها خالی → null (پیام بی‌مورد نفرست)", () => {
    expect(formatDigest([{ metric: "whale", label: "پول درشت", symbols: [] }], SITE)).toBeNull();
  });
});
