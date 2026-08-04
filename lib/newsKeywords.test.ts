import { describe, expect, it } from "vitest";
import { matchKeywords } from "./newsKeywords.ts";

describe("matchKeywords", () => {
  it("کلیدواژهٔ فارسی موجود در متن را پیدا می‌کند", () => {
    const result = matchKeywords("ایران و آمریکا وارد دور جدید مذاکره شدند", ["مذاکره", "جنگ"]);
    expect(result).toEqual(["مذاکره"]);
  });

  it("کلیدواژهٔ انگلیسی case-insensitive است", () => {
    expect(matchKeywords("Iran and US reached a CEASEFIRE deal", ["ceasefire"])).toEqual(["ceasefire"]);
  });

  it("چند کلیدواژه هم‌زمان trigger می‌شوند", () => {
    const result = matchKeywords("تحریم جدید علیه ایران پس از شکست مذاکره", ["تحریم", "مذاکره", "جنگ"]);
    expect(result).toEqual(["تحریم", "مذاکره"]);
  });

  it("بدون تطابق آرایهٔ خالی می‌دهد", () => {
    expect(matchKeywords("گزارش فصلی شرکت خودروسازی", ["جنگ", "تحریم"])).toEqual([]);
  });
});
