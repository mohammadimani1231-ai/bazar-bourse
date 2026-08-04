import { describe, expect, it } from "vitest";
import { toCsv } from "./csv.ts";

interface Row {
  symbol: string;
  price: number;
  note: string;
}

describe("toCsv", () => {
  const rows: Row[] = [
    { symbol: "فملی", price: 12000, note: "عادی" },
    { symbol: "خودرو", price: 3400, note: 'شامل کاما, و "نقل‌قول"' },
  ];
  const columns = [
    { header: "نماد", accessor: (r: Row) => r.symbol },
    { header: "قیمت", accessor: (r: Row) => r.price },
    { header: "یادداشت", accessor: (r: Row) => r.note },
  ];

  it("با BOM شروع می‌شود", () => {
    expect(toCsv(rows, columns).charCodeAt(0)).toBe(0xfeff);
  });

  it("هدر و ردیف‌ها را با \\r\\n جدا می‌کند", () => {
    const csv = toCsv(rows, columns);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("نماد,قیمت,یادداشت");
    expect(lines[1]).toBe("فملی,12000,عادی");
  });

  it("سلول‌های دارای کاما یا نقل‌قول را quote و escape می‌کند", () => {
    const csv = toCsv(rows, columns);
    expect(csv).toContain('"شامل کاما, و ""نقل‌قول"""');
  });

  it("مقدار null/undefined خالی می‌شود", () => {
    const nullRow: { a: string | null; b: string | undefined } = { a: null, b: undefined };
    const csv = toCsv([nullRow], [
      { header: "a", accessor: (r) => r.a },
      { header: "b", accessor: (r) => r.b },
    ]);
    expect(csv.slice(1).split("\r\n")[1]).toBe(",");
  });
});
