function escapeHtml(text: string): string {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface ReportTableColumn<T> {
  header: string;
  accessor: (row: T) => string;
  align?: "start" | "end";
}

/** جدول HTML ساده — همهٔ مقادیر از قبل باید رشتهٔ فرمت‌شده باشند (فراخوان تصمیم می‌گیرد چطور فرمت شود). */
export function renderReportTable<T>(columns: ReportTableColumn<T>[], rows: T[]): string {
  if (rows.length === 0) {
    return `<p class="report-empty">داده‌ای برای این بخش نیست.</p>`;
  }
  const thead = columns
    .map((c) => `<th style="text-align:${c.align === "end" ? "left" : "right"}">${escapeHtml(c.header)}</th>`)
    .join("");
  const tbody = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((c) => `<td style="text-align:${c.align === "end" ? "left" : "right"}">${escapeHtml(c.accessor(row))}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<table class="report-table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
}

export function renderReportSection(title: string, bodyHtml: string): string {
  return `<section class="report-section"><h2>${escapeHtml(title)}</h2>${bodyHtml}</section>`;
}

/** پاراگراف ساده با متن escape‌شده (برای متن‌های آزاد مثل خلاصهٔ LLM یا توضیح). */
export function renderReportParagraph(text: string): string {
  return `<p class="report-paragraph">${escapeHtml(text)}</p>`;
}

/*
 * رنگ‌ها/فونت‌ها از var(--...) اپ اصلی می‌آیند (طبق design_handoff_dashboard_redesign) —
 * قبلاً این گزارش‌ها یک پوستهٔ تیرهٔ کاملاً مستقل و هاردکد داشتند (Tahoma، #131318) که با پالت
 * جدید روشن سایت هم‌خوان نبود و فونت اعداد را هم Vazirmatn/JetBrains Mono نمی‌کرد — باگ واقعی
 * پشت شکایت کاربر دربارهٔ فونت نمودار در /reports (رجوع به CLAUDE.md بخش «سه incident»).
 * چون این HTML همیشه با dangerouslySetInnerHTML داخل صفحهٔ زندهٔ app/reports می‌نشیند، به
 * توکن‌های app/globals.css دسترسی دارد و حتی سوییچ تم روشن/تاریک را هم خودکار دنبال می‌کند.
 */
const REPORT_STYLE = `
.report-root { font-family: var(--font-vazirmatn), Tahoma, sans-serif; direction: rtl; color: var(--foreground); background: var(--surface); padding: 16px; border-radius: 14px; border: 1px solid var(--border); }
.report-root h1 { font-size: 20px; margin: 0 0 4px; }
.report-root .report-subtitle { font-size: 12px; color: var(--muted); margin: 0 0 16px; }
.report-root .report-section { margin-bottom: 20px; }
.report-root .report-section h2 { font-size: 14px; border-bottom: 1px solid var(--border); padding-bottom: 4px; margin-bottom: 8px; }
.report-root .report-paragraph { font-size: 13px; line-height: 1.9; }
.report-root .report-empty { font-size: 12px; color: var(--muted); }
.report-root .report-footer, .report-root .report-subtitle { font-family: var(--font-jetbrains-mono), var(--font-vazirmatn), monospace; }
.report-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.report-table th, .report-table td { border-bottom: 1px solid var(--border); padding: 4px 8px; font-family: var(--font-jetbrains-mono), var(--font-vazirmatn), monospace; }
.report-table th { color: var(--muted); font-weight: normal; font-family: var(--font-vazirmatn), sans-serif; }
.report-footer { font-size: 11px; color: var(--muted); margin-top: 20px; border-top: 1px solid var(--border); padding-top: 8px; }
@media print {
  body * { visibility: hidden; }
  .report-root, .report-root * { visibility: visible; }
  .report-root { position: absolute; top: 0; left: 0; width: 100%; background: white !important; color: black !important; }
  .report-root .report-subtitle, .report-root .report-empty, .report-root .report-footer,
  .report-root .report-section h2, .report-table th { color: #555 !important; }
  .report-root .report-section h2, .report-table th, .report-table td { border-color: #ccc !important; }
}
`;

/** پوستهٔ کامل یک گزارش — یک <div> مستقل با استایل خودش (print-friendly)، بدون html/head/body. */
export function renderReportShell(title: string, subtitle: string, sectionsHtml: string, footerHtml: string): string {
  return `<style>${REPORT_STYLE}</style><div class="report-root"><h1>${escapeHtml(title)}</h1><p class="report-subtitle">${escapeHtml(subtitle)}</p>${sectionsHtml}<div class="report-footer">${footerHtml}</div></div>`;
}
