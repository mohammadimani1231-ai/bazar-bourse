export interface SignalAlertItem {
  symbol: string;
  score: number;
}

function symbolLink(siteUrl: string, symbol: string): string {
  return `<a href="${siteUrl}/symbol/${encodeURIComponent(symbol)}">${symbol}</a>`;
}

/** چند سیگنال هم‌جهت هم‌زمان (مثلا چند نماد یک صنعت) در یک پیام گروه‌بندی می‌شوند. */
export function formatSignalAlert(direction: "buy" | "sell", items: SignalAlertItem[], siteUrl: string): string {
  const dirLabel = direction === "buy" ? "خرید" : "فروش";
  const emoji = direction === "buy" ? "📈" : "📉";
  const lines = items.map((i) => `• ${symbolLink(siteUrl, i.symbol)} — score ${i.score}`);
  return `${emoji} سیگنال ${dirLabel} جدید (${items.length})\n${lines.join("\n")}`;
}

export function formatTensionAlert(gaugeValue: number, siteUrl: string): string {
  return `🌡️ جهش شاخص تنش: ${gaugeValue.toFixed(0)}/۱۰۰\n${siteUrl}`;
}

export function formatPipelineDownAlert(sources: string[], siteUrl: string): string {
  return `🔴 خطای پایپ‌لاین: ${sources.join("، ")}\n${siteUrl}/health`;
}

export interface DigestGroup {
  metric: string;
  label: string;
  symbols: string[];
}

/** دایجست ساعتی — همهٔ هشدارهای info در یک پیام واحد جمع می‌شوند (ضد نویز). */
export function formatDigest(groups: DigestGroup[], siteUrl: string): string | null {
  const nonEmpty = groups.filter((g) => g.symbols.length > 0);
  if (nonEmpty.length === 0) return null;

  const lines = nonEmpty.map((g) => {
    const symbolLinks = g.symbols.map((s) => symbolLink(siteUrl, s)).join("، ");
    return `${g.label}: ${symbolLinks}`;
  });
  return `ℹ️ دایجست ساعتی\n${lines.join("\n")}`;
}
