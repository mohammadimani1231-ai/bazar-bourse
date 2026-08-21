import { describe, it, expect } from "vitest";
import { kiloTomanToRial, rialToToman, tomanToRial, rialToKiloToman } from "./units";

describe("units: واحد تبدیل‌ها", () => {
  describe("kiloTomanToRial", () => {
    it("هزارتومان را به ریال تبدیل می‌کند", () => {
      // مرجع: دلار ۱,۸۹۴,۰۰۰ تومان → ۱۸۹۴ هزارتومان (از API)
      expect(kiloTomanToRial(1894)).toBe(1894000);
    });

    it("null را preserve می‌کند", () => {
      expect(kiloTomanToRial(null)).toBe(null);
    });
  });

  describe("rialToToman", () => {
    it("ریال را به تومان تبدیل می‌کند (÷۱۰)", () => {
      // مرجع: ۱۸,۹۴۰,۰۰۰ ریال = ۱۸۹۴,۰۰۰ تومان
      expect(rialToToman(18940000)).toBe(1894000);
    });

    it("null را preserve می‌کند", () => {
      expect(rialToToman(null)).toBe(null);
    });
  });

  describe("معکوس‌ها", () => {
    it("tomanToRial برعکس rialToToman است", () => {
      const rial = 18940000;
      expect(tomanToRial(rialToToman(rial))).toBe(rial);
    });

    it("rialToKiloToman برعکس kiloTomanToRial است", () => {
      const kiloToman = 1894;
      expect(rialToKiloToman(kiloTomanToRial(kiloToman))).toBe(kiloToman);
    });
  });

  describe("حالات واقعی", () => {
    it("طلای ۱۸ عیار: ۱۹۸,۵۲۷,۰۰۰ ریال", () => {
      // فیکس: ریال است، بدون تبدیل
      const gold18kRial = 198527000;
      expect(rialToToman(gold18kRial)).toBe(19852700); // تومان
    });

    it("دلار ۱,۸۹۴,۰۰۰ تومان", () => {
      // فیکس: API هزارتومان می‌دهد
      const usdKiloToman = 1894;
      const usdRial = kiloTomanToRial(usdKiloToman);
      expect(usdRial).toBe(1894000); // ریال
      expect(rialToToman(usdRial)).toBe(189400); // تومان برای نمایش
    });
  });
});
