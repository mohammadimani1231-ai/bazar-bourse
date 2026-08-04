"use client";

export function ExportCsvButton({ getCsv, filename }: { getCsv: () => string; filename: string }) {
  const handleClick = () => {
    const blob = new Blob([getCsv()], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleClick}
      className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-foreground"
    >
      خروجی CSV
    </button>
  );
}
