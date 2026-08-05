import { describe, expect, it } from "vitest";
import { renderReportTable, renderReportSection, renderReportParagraph, renderReportShell } from "./reportHtml.ts";

interface Row {
  symbol: string;
  value: number;
}

describe("renderReportTable", () => {
  const columns = [
    { header: "نماد", accessor: (r: Row) => r.symbol },
    { header: "ارزش", accessor: (r: Row) => String(r.value), align: "end" as const },
  ];

  it("یک <tr> به ازای هر ردیف می‌سازد", () => {
    const html = renderReportTable(columns, [{ symbol: "فملی", value: 100 }, { symbol: "خودرو", value: 50 }]);
    expect((html.match(/<tr>/g) ?? []).length).toBe(3); // ۱ هدر + ۲ ردیف
  });

  it("آرایهٔ خالی پیام «داده‌ای نیست» می‌دهد", () => {
    const html = renderReportTable(columns, []);
    expect(html).toContain("داده‌ای برای این بخش نیست");
    expect(html).not.toContain("<table");
  });

  it("مقادیر را escape می‌کند", () => {
    const html = renderReportTable(columns, [{ symbol: "<script>", value: 1 }]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("renderReportSection و renderReportParagraph", () => {
  it("عنوان و بدنه را در section قرار می‌دهد", () => {
    const html = renderReportSection("بازار در یک نگاه", renderReportParagraph("متن تست"));
    expect(html).toContain("بازار در یک نگاه");
    expect(html).toContain("متن تست");
    expect(html).toContain("<section");
  });
});

describe("renderReportShell", () => {
  it("عنوان/زیرعنوان/بخش‌ها/فوتر همه در خروجی هستند", () => {
    const html = renderReportShell("گزارش هفتگی", "۱۴۰۵/۰۵/۰۶ تا ۱۴۰۵/۰۵/۱۳", "<section>بدنه</section>", "پاورقی تست");
    expect(html).toContain("گزارش هفتگی");
    expect(html).toContain("۱۴۰۵/۰۵/۰۶");
    expect(html).toContain("بدنه");
    expect(html).toContain("پاورقی تست");
    expect(html).toContain("@media print");
  });
});
