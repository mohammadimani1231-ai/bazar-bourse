import type { MarketRegime } from "@/lib/marketRegime.ts";

const REGIME_META: Record<Exclude<MarketRegime, "normal">, { label: string; className: string }> = {
  war_risk: { label: "رژیم بازار: تنش — اعتبار سیگنال‌های تکنیکال کاهش‌یافته", className: "bg-down/20 text-down" },
  agreement_hope: { label: "رژیم بازار: امید توافق — اعتبار سیگنال‌های تکنیکال کاهش‌یافته", className: "bg-up/20 text-up" },
};

export function RegimeBanner({ regime }: { regime: MarketRegime }) {
  if (regime === "normal") return null;
  const meta = REGIME_META[regime];

  return (
    <div className={`border-b border-shell-border px-4 py-1.5 text-center text-xs font-bold ${meta.className}`}>
      {meta.label}
    </div>
  );
}
