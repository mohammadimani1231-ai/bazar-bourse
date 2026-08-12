/**
 * متریک‌های سطح معامله و منحنی سرمایه — تعریف واحد مشترک بین scripts/backtest.ts و
 * موتور عملکرد پرتفوی مجازی (قید #۳: بدون پیاده‌سازی موازی).
 *
 * قراردادهای عمدی که عیناً از بک‌تست موجود منتقل شده‌اند (تغییرشان یعنی تغییر همهٔ اعداد
 * تاریخی گزارش‌شده، پس دست‌نخورده مانده‌اند):
 *   - «برد» یعنی pnl > 0؛ معاملهٔ با pnl دقیقاً صفر جزو زیان‌ها شمرده می‌شود.
 *   - profit factor وقتی هیچ زیانی نیست ولی سود هست Infinity است، و وقتی هیچ‌کدام نیست صفر.
 *   - سالانه‌سازی Sharpe/Sortino با ۲۵۰ روز معاملاتی.
 */

export interface TradeLike {
  pnl: number;
}

export interface EquityPoint {
  date: string;
  equity: number;
}

export const TRADING_DAYS_PER_YEAR = 250;

export function splitWinsLosses<T extends TradeLike>(trades: T[]): { wins: T[]; losses: T[] } {
  return {
    wins: trades.filter((t) => t.pnl > 0),
    losses: trades.filter((t) => t.pnl <= 0),
  };
}

export function winRatePct(trades: TradeLike[]): number {
  if (trades.length === 0) return 0;
  return (splitWinsLosses(trades).wins.length / trades.length) * 100;
}

export function grossProfitLoss(trades: TradeLike[]): { grossProfit: number; grossLoss: number } {
  const { wins, losses } = splitWinsLosses(trades);
  return {
    grossProfit: wins.reduce((s, t) => s + t.pnl, 0),
    grossLoss: Math.abs(losses.reduce((s, t) => s + t.pnl, 0)),
  };
}

export function profitFactor(trades: TradeLike[]): number {
  const { grossProfit, grossLoss } = grossProfitLoss(trades);
  if (grossLoss > 0) return grossProfit / grossLoss;
  return grossProfit > 0 ? Infinity : 0;
}

export function expectancy(trades: TradeLike[]): number {
  if (trades.length === 0) return 0;
  return trades.reduce((s, t) => s + t.pnl, 0) / trades.length;
}

export function averageWin(trades: TradeLike[]): number | null {
  const { wins } = splitWinsLosses(trades);
  if (wins.length === 0) return null;
  return wins.reduce((s, t) => s + t.pnl, 0) / wins.length;
}

export function averageLoss(trades: TradeLike[]): number | null {
  const { losses } = splitWinsLosses(trades);
  if (losses.length === 0) return null;
  return losses.reduce((s, t) => s + t.pnl, 0) / losses.length;
}

export function bestTrade<T extends TradeLike>(trades: T[]): T | null {
  return trades.reduce<T | null>((best, t) => (best == null || t.pnl > best.pnl ? t : best), null);
}

export function worstTrade<T extends TradeLike>(trades: T[]): T | null {
  return trades.reduce<T | null>((worst, t) => (worst == null || t.pnl < worst.pnl ? t : worst), null);
}

/** بازده‌های دوره‌به‌دورهٔ منحنی سرمایه (نسبت، نه درصد). */
export function equityReturns(points: EquityPoint[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].equity;
    if (prev > 0) returns.push(points[i].equity / prev - 1);
  }
  return returns;
}

export function sharpeRatio(returns: number[], periodsPerYear = TRADING_DAYS_PER_YEAR): number {
  if (returns.length === 0) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, returns.length - 1));
  return std > 0 ? (mean / std) * Math.sqrt(periodsPerYear) : 0;
}

export function sortinoRatio(returns: number[], periodsPerYear = TRADING_DAYS_PER_YEAR): number {
  if (returns.length === 0) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const downside = returns.filter((r) => r < 0);
  const downsideStd = Math.sqrt(downside.reduce((s, r) => s + r ** 2, 0) / Math.max(1, downside.length));
  return downsideStd > 0 ? (mean / downsideStd) * Math.sqrt(periodsPerYear) : 0;
}

/** عمیق‌ترین افت از سقف قبلی، به درصد (همیشه ≤ ۰) به‌همراه سری underwater. */
export function maxDrawdown(points: EquityPoint[]): {
  maxDrawdownPct: number;
  underwater: { date: string; pct: number }[];
  troughDate: string;
} {
  let peak = points[0]?.equity ?? 0;
  let maxDrawdownPct = 0;
  let troughDate = "";
  const underwater: { date: string; pct: number }[] = [];

  for (const point of points) {
    if (point.equity > peak) peak = point.equity;
    const pct = peak > 0 ? (point.equity / peak - 1) * 100 : 0;
    underwater.push({ date: point.date, pct });
    if (pct < maxDrawdownPct) {
      maxDrawdownPct = pct;
      troughDate = point.date;
    }
  }

  return { maxDrawdownPct, underwater, troughDate };
}
