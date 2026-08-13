import { createServerSupabaseClient } from "@/lib/supabase/serverClient.ts";
import { RiskSettingsForm } from "@/components/RiskSettingsForm";

export const dynamic = "force-dynamic";

interface RiskSettingsRow {
  total_capital: number | null;
  max_risk_per_trade_pct: number;
  max_concurrent_positions: number;
  max_sector_exposure_pct: number;
  max_single_position_pct: number;
  regime_risk_multiplier: Record<string, number>;
}

export default async function RiskSettingsPage() {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("risk_settings")
    .select(
      "total_capital, max_risk_per_trade_pct, max_concurrent_positions, max_sector_exposure_pct, max_single_position_pct, regime_risk_multiplier",
    )
    .eq("id", 1)
    .maybeSingle<RiskSettingsRow>();

  // ردیف تک‌گانه با مایگریشن stage08 از قبل seed می‌شود؛ اگر به هر دلیل نبود، پیش‌فرض‌های
  // منطقی (طبق پرامپت فاز ۸) به‌جای کرش صفحه نشان داده می‌شود.
  const settings: RiskSettingsRow = data ?? {
    total_capital: null,
    max_risk_per_trade_pct: 1.5,
    max_concurrent_positions: 8,
    max_sector_exposure_pct: 30,
    max_single_position_pct: 15,
    regime_risk_multiplier: { normal: 1, war_risk: 0.5, agreement_hope: 0.75 },
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted">
        این ماژول تصمیم نمی‌گیرد، محدود می‌کند — اندازهٔ نهایی معامله همیشه با خودت است.
      </p>
      <RiskSettingsForm initial={settings} />
    </div>
  );
}
