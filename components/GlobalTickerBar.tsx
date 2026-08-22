import { formatFaNumber, formatFaPercent, toToman } from "@/lib/format.ts";
import { formatTehranTime } from "@/lib/jalali.ts";

export interface TickerItem {
  asset: string;
  label: string;
  price: number | null;
  changePct: number | null;
  capturedAt: string | null;
}

// واحد و دقت اعشار هر دارایی متفاوت است — نمایش یکسان (۰ رقم اعشار، بدون واحد) روی همه باعث
// می‌شد مس (۶.۶۱$) به «۷» گرد شود و کاربر بدون هیچ نشانه‌ای نتواند تشخیص بدهد عدد دلار است،
// امتیاز شاخص است یا تومان (رجوع بررسی ۲۰۲۶-۰۸-۱۶). دلار آزاد/طلای۱۸/سکه امامی در DB به ریال
// ذخیره می‌شوند (lib/transforms/globalQuote.ts) — toToman تنها نقطهٔ تبدیل است.
const UNIT_CONFIG: Record<string, { unit: string; toDisplay: (v: number | null) => number | null; decimals: number }> = {
  brent: { unit: "دلار", toDisplay: (v) => v, decimals: 1 },
  gold_ounce: { unit: "دلار", toDisplay: (v) => v, decimals: 1 },
  copper: { unit: "دلار", toDisplay: (v) => v, decimals: 2 },
  dxy: { unit: "امتیاز", toDisplay: (v) => v, decimals: 2 },
  sp500: { unit: "امتیاز", toDisplay: (v) => v, decimals: 0 },
  usd_irr: { unit: "تومان", toDisplay: toToman, decimals: 0 },
  gold_18k: { unit: "تومان", toDisplay: (v) => v, decimals: 0 },
  coin_emami: { unit: "تومان", toDisplay: (v) => v, decimals: 0 },
};

// گروه‌بندی بصری: ۵ دارایی جهانی (دلاری/امتیازی) از ۳ دارایی داخلی (تومانی) با یک جداکنندهٔ
// ضخیم‌تر و برچسب سربرگ جدا می‌شوند تا کاربر با یک نگاه گیج نشود کدام گروه کدام واحد است.
const DOMESTIC_ASSETS = new Set(["usd_irr", "gold_18k", "coin_emami"]);

export function GlobalTickerBar({ items }: { items: TickerItem[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
      <div className="flex min-w-max divide-x divide-x-reverse divide-border">
        {items.map((item, i) => {
          const config = UNIT_CONFIG[item.asset] ?? { unit: "", toDisplay: (v: number | null) => v, decimals: 0 };
          const displayPrice = config.toDisplay(item.price);
          const isFirstDomestic = DOMESTIC_ASSETS.has(item.asset) && !DOMESTIC_ASSETS.has(items[i - 1]?.asset ?? "");
          return (
            <div
              key={item.asset}
              className={`flex flex-col gap-1 px-4 py-3 ${isFirstDomestic ? "border-r-2 border-r-border" : ""}`}
            >
              <span className="text-xs text-muted">
                {item.label} <span className="text-muted/70">({config.unit})</span>
              </span>
              <span className="ltr-nums text-right text-sm font-bold">
                {formatFaNumber(displayPrice, config.decimals)}
              </span>
              <span
                className={`ltr-nums text-right text-xs ${
                  item.changePct == null
                    ? "text-muted"
                    : item.changePct > 0
                      ? "text-up-text"
                      : item.changePct < 0
                        ? "text-down-text"
                        : "text-muted"
                }`}
              >
                {formatFaPercent(item.changePct)}
              </span>
              {item.capturedAt && (
                <span className="ltr-nums text-right text-[10px] text-muted/70">
                  {formatTehranTime(item.capturedAt)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
