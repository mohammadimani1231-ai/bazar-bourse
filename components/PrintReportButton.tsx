"use client";

export function PrintReportButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded border border-border px-3 py-1.5 text-xs font-bold text-foreground hover:bg-surface-2 print:hidden"
    >
      چاپ
    </button>
  );
}
