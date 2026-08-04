/** عدد با جداکنندهٔ هزارگان و ارقام فارسی، مثل «۱۲۳٬۴۵۶» */
export function formatFaNumber(value: number | null | undefined, maxFractionDigits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("fa-IR", { maximumFractionDigits: maxFractionDigits });
}

/** درصد با علامت +/- و ارقام فارسی، مثل «۲٫۳٪+» */
export function formatFaPercent(value: number | null | undefined, fractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("fa-IR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}٪`;
}

/** مبلغ ریالی فشرده، مثل «۱۲۳٫۴ میلیارد» یا «۵۶۰ میلیون» */
export function formatFaCompactRial(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000_000) {
    return `${sign}${formatFaNumber(abs / 1_000_000_000_000, 1)} همت`;
  }
  if (abs >= 1_000_000_000) {
    return `${sign}${formatFaNumber(abs / 1_000_000_000, 1)} میلیارد`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${formatFaNumber(abs / 1_000_000, 1)} میلیون`;
  }
  return `${sign}${formatFaNumber(abs, 0)}`;
}
