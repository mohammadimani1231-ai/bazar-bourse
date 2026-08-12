"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateSymbolReport } from "@/app/symbol/[symbol]/actions.ts";

export function GenerateSymbolReportButton({ symbol }: { symbol: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await generateSymbolReport(symbol);
      if (result.ok) {
        router.push(`/reports?type=symbol&symbol=${encodeURIComponent(symbol)}`);
      } else {
        setError(result.error ?? "خطای نامشخص در تولید گزارش");
      }
    });
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="rounded bg-warning px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "در حال تولید گزارش…" : "تولید گزارش عمیق نماد"}
      </button>
      {error && <p className="text-[11px] text-red-400">خطا: {error}</p>}
    </div>
  );
}
