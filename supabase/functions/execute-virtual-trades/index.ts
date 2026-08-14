import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { checkMarketOpen } from "../_shared/marketStatus.ts";
import { queueState } from "../../../lib/tabloo.ts";
import { atr } from "../../../lib/indicators.ts";
import { calculatePositionSize, suggestStopLossFromAtr } from "../../../lib/position-sizing.ts";
import {
  decideBuyExecution,
  decideSellExecution,
  shouldExpirePending,
  isQuoteFromToday,
} from "../../../lib/virtualExecution.ts";
import { decideExit } from "../../../lib/exitRules.ts";
import { tradingDaysBetween } from "../../../lib/tradingDays.ts";
import type { MarketRegime } from "../../../lib/marketRegime.ts";

/**
 * پرتفوی مجازی خودکار — سیگنال‌های خود سیستم را با بودجهٔ فرضی اجرا می‌کند (قانون #۱۴
 * CLAUDE.md: جریان یک‌طرفه؛ این تابع هرگز چیزی در signal_rules یا منطق سیگنال نمی‌نویسد).
 *
 * هر چرخه سه کار به همین ترتیب انجام می‌دهد:
 *   ۱. سفارش‌های در انتظار صف را دوباره امتحان یا منقضی می‌کند
 *   ۲. پوزیشن‌های باز را برای خروج (حد ضرر / سیگنال فروش / سقف نگه‌داری) بررسی می‌کند
 *   ۳. سیگنال‌های خرید جدیدی که هنوز رکورد virtual_trades ندارند را اجرا می‌کند
 *
 * ضد look-ahead: هر تصمیم فقط با آخرین quote موجود در همان لحظه گرفته می‌شود.
 * idempotent: قید یکتایی signal_id در جدول تضمین می‌کند یک سیگنال دوبار اجرا نشود.
 */

const CANDLE_HISTORY_ROWS = 60; // برای ATR14 کافی است
const SIGNAL_LOOKBACK_MS = 24 * 60 * 60 * 1000;

interface PortfolioRow {
  initial_capital: number;
  buy_fee_pct: number;
  sell_fee_pct: number;
  max_hold_days: number;
  queue_wait_days: number;
}

interface RiskRow {
  max_risk_per_trade_pct: number;
  max_concurrent_positions: number;
  max_single_position_pct: number;
  regime_risk_multiplier: Record<string, number>;
}

interface QuoteRow {
  last_price: number | null;
  bid1_price: number | null;
  ask1_price: number | null;
  price_max: number | null;
  price_min: number | null;
  bid1_volume: number | null;
  base_volume: number | null;
  captured_at: string;
}

interface TradeRow {
  id: number;
  symbol: string;
  status: string;
  signal_at: string;
  entry_at: string | null;
  entry_price: number | null;
  share_count: number | null;
  stop_loss_price: number | null;
  queue_wait_days: number;
}

Deno.serve(async () => {
  const start = performance.now();
  const client = createServiceClient();

  try {
    const marketStatus = await checkMarketOpen(client);
    if (!marketStatus.open) {
      const latencyMs = Math.round(performance.now() - start);
      await logHealth(client, "execute-virtual-trades", "market_closed", marketStatus.reason, latencyMs);
      return new Response(JSON.stringify({ ok: true, skipped: "market_closed", reason: marketStatus.reason }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: portfolioRaw, error: portfolioError } = await client
      .from("virtual_portfolio")
      .select("initial_capital, buy_fee_pct, sell_fee_pct, max_hold_days, queue_wait_days")
      .eq("id", 1)
      .single();
    if (portfolioError) throw portfolioError;
    const portfolio = portfolioRaw as PortfolioRow;

    const { data: riskRaw, error: riskError } = await client
      .from("risk_settings")
      .select("max_risk_per_trade_pct, max_concurrent_positions, max_single_position_pct, regime_risk_multiplier")
      .eq("id", 1)
      .single();
    if (riskError) throw riskError;
    const risk = riskRaw as RiskRow;

    const { data: regimeSetting } = await client
      .from("settings")
      .select("value")
      .eq("key", "market_regime")
      .maybeSingle();
    const regime = ((regimeSetting?.value as string | undefined) ?? "normal") as MarketRegime;

    const nowUtc = new Date();
    const nowIso = nowUtc.toISOString();
    const buyFeePct = Number(portfolio.buy_fee_pct);
    const sellFeePct = Number(portfolio.sell_fee_pct);

    // نقد از روی خود معاملات بازمحاسبه می‌شود، نه از ستون ذخیره‌شده — اگر یک اجرا وسط کار
    // شکست بخورد (خطای شبکه، تایم‌اوت)، اجرای بعدی خودبه‌خود عدد درست را بازسازی می‌کند.
    // ستون virtual_portfolio.cash فقط یک cache برای نمایش است که هر اجرا بازنویسی می‌شود.
    const { data: cashRows, error: cashError } = await client
      .from("virtual_trades")
      .select("share_count, entry_price, entry_fee, exit_price, exit_fee, status");
    if (cashError) throw cashError;
    let cash = Number(portfolio.initial_capital);
    for (const t of cashRows ?? []) {
      if (t.entry_price != null && t.share_count != null) {
        cash -= Number(t.share_count) * Number(t.entry_price) + Number(t.entry_fee ?? 0);
      }
      if (t.status === "closed" && t.exit_price != null && t.share_count != null) {
        cash += Number(t.share_count) * Number(t.exit_price) - Number(t.exit_fee ?? 0);
      }
    }

    const quoteCache = new Map<string, QuoteRow | null>();
    async function latestQuote(symbol: string): Promise<QuoteRow | null> {
      const cached = quoteCache.get(symbol);
      if (cached !== undefined) return cached;
      const { data } = await client
        .from("quotes")
        .select("last_price, bid1_price, ask1_price, price_max, price_min, bid1_volume, base_volume, captured_at")
        .eq("symbol", symbol)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const row = (data ?? null) as QuoteRow | null;
      quoteCache.set(symbol, row);
      return row;
    }

    /**
     * کوت تازه = کوتی که هم وجود دارد، هم قیمت دارد، هم مال همان روز تقویمی تهران است.
     * هیچ تصمیمی (ورود، پرکردن سفارش صف، خروج) نباید روی کوت کهنه گرفته شود — نه در
     * تعطیلی ثبت‌نشده، نه روی نماد متوقف.
     */
    async function freshQuote(symbol: string): Promise<QuoteRow | null> {
      const q = await latestQuote(symbol);
      if (q == null || q.last_price == null) return null;
      return isQuoteFromToday(q.captured_at, nowUtc) ? q : null;
    }

    const { data: openRaw, error: openError } = await client
      .from("virtual_trades")
      .select("id, symbol, status, signal_at, entry_at, entry_price, share_count, stop_loss_price, queue_wait_days")
      .in("status", ["executed", "partial", "pending_queue"]);
    if (openError) throw openError;
    const openRows = (openRaw ?? []) as TradeRow[];

    const openPositions = openRows.filter((r) => r.status === "executed" || r.status === "partial");
    const pendingOrders = openRows.filter((r) => r.status === "pending_queue");

    // ارزش کل پرتفوی (نقد + ارزش بازار پوزیشن‌های باز) — مبنای سقف‌های ریسک فاز ۸.
    let positionsValue = 0;
    for (const pos of openPositions) {
      const q = await latestQuote(pos.symbol);
      const price = q?.last_price ?? Number(pos.entry_price ?? 0);
      positionsValue += Number(pos.share_count ?? 0) * price;
    }
    const totalEquity = cash + positionsValue;

    /** اندازهٔ پوزیشن + حد ضرر پیشنهادی — عیناً از توابع فاز ۸، بدون پیاده‌سازی موازی. */
    async function sizePosition(
      symbol: string,
      price: number,
    ): Promise<{ shareCount: number; stopLoss: number | null; warnings: string[] }> {
      const { data: candlesDesc } = await client
        .from("daily_candles")
        .select("high, low, close")
        .eq("symbol", symbol)
        .order("date", { ascending: false })
        .limit(CANDLE_HISTORY_ROWS);

      const candles = [...(candlesDesc ?? [])].reverse() as {
        high: number | null;
        low: number | null;
        close: number | null;
      }[];
      const complete = candles.filter((c) => c.high != null && c.low != null && c.close != null);
      if (complete.length < 15) {
        return { shareCount: 0, stopLoss: null, warnings: ["تاریخچهٔ کافی برای ATR14 نیست — اندازهٔ پوزیشن صفر"] };
      }

      const atrSeries = atr(
        complete.map((c) => c.high as number),
        complete.map((c) => c.low as number),
        complete.map((c) => c.close as number),
        14,
      );
      const lastAtr = atrSeries[atrSeries.length - 1];
      if (lastAtr == null) {
        return { shareCount: 0, stopLoss: null, warnings: ["ATR14 قابل محاسبه نیست — اندازهٔ پوزیشن صفر"] };
      }

      const stopLoss = suggestStopLossFromAtr(price, lastAtr);
      const q = await latestQuote(symbol);
      const bandPct =
        q?.price_max != null && q?.price_min != null && price > 0
          ? ((q.price_max - q.price_min) / 2 / price) * 100
          : undefined;

      const sizing = calculatePositionSize({
        capital: totalEquity,
        riskPerTradePct: Number(risk.max_risk_per_trade_pct),
        entryPrice: price,
        stopLossPrice: stopLoss,
        regime,
        regimeMultiplier: risk.regime_risk_multiplier,
        maxSinglePositionPct: Number(risk.max_single_position_pct),
        bandPct,
        queueLocked: q ? { buy: queueState(q).lockedBuy, sell: queueState(q).lockedSell } : undefined,
      });

      return { shareCount: sizing.shareCount, stopLoss, warnings: sizing.warnings };
    }

    const actions: string[] = [];

    // ── ۱. سفارش‌های در انتظار صف ──────────────────────────────────────────────
    for (const order of pendingOrders) {
      const q = await freshQuote(order.symbol);
      if (!q || q.last_price == null) {
        // دادهٔ امروز نداریم — نه پر می‌کنیم نه شمارندهٔ انتظار را جلو می‌بریم (روزی که اصلاً
        // معامله‌ای نشده نباید جزو «۳ روز انتظار صف» حساب شود).
        actions.push(`${order.symbol}: انتظار صف بدون تغییر (دادهٔ امروز موجود نیست)`);
        continue;
      }
      const qs = queueState(q);

      if (qs.lockedBuy === true) {
        // این تابع چند بار در روز اجرا می‌شود — شمارندهٔ انتظار فقط یک‌بار در هر روز جلو می‌رود.
        const lastTouch = order.entry_at ?? order.signal_at;
        if (lastTouch.slice(0, 10) === nowIso.slice(0, 10)) continue;

        const waitDays = order.queue_wait_days + 1;
        if (shouldExpirePending(waitDays, portfolio.queue_wait_days)) {
          await client
            .from("virtual_trades")
            .update({
              status: "expired_queue",
              status_note: `صف خرید بعد از ${waitDays} روز معاملاتی باز نشد — سفارش منقضی شد`,
              queue_wait_days: waitDays,
              updated_at: nowIso,
            })
            .eq("id", order.id);
          actions.push(`${order.symbol}: expired_queue`);
        } else {
          await client
            .from("virtual_trades")
            .update({ queue_wait_days: waitDays, entry_at: nowIso, updated_at: nowIso })
            .eq("id", order.id);
        }
        continue;
      }

      // صف باز شد — با قیمت واقعی همین لحظه پر می‌شود (نه قیمت روز سیگنال).
      const desired = await sizePosition(order.symbol, q.last_price);
      const decision = decideBuyExecution({
        cash,
        openPositionCount: openPositions.length,
        maxConcurrentPositions: Number(risk.max_concurrent_positions),
        desiredShareCount: desired.shareCount,
        price: q.last_price,
        buyFeePct,
        queue: qs,
      });

      if (decision.status === "executed" || decision.status === "partial") {
        cash -= decision.totalCost;
        openPositions.push({
          ...order,
          status: decision.status,
          entry_at: nowIso,
          entry_price: q.last_price,
          share_count: decision.shareCount,
          stop_loss_price: desired.stopLoss,
        });
        await client
          .from("virtual_trades")
          .update({
            status: decision.status,
            status_note: `بعد از ${order.queue_wait_days} روز انتظار صف: ${decision.note}`,
            entry_at: nowIso,
            entry_price: q.last_price,
            share_count: decision.shareCount,
            entry_fee: decision.fee,
            stop_loss_price: desired.stopLoss,
            updated_at: nowIso,
          })
          .eq("id", order.id);
      } else {
        await client
          .from("virtual_trades")
          .update({ status: decision.status, status_note: decision.note, updated_at: nowIso })
          .eq("id", order.id);
      }
      actions.push(`${order.symbol}: ${decision.status} (پس از انتظار صف)`);
    }

    // ── ۲. خروج از پوزیشن‌های باز ─────────────────────────────────────────────
    const sinceIso = new Date(Date.now() - SIGNAL_LOOKBACK_MS).toISOString();
    const { data: recentSells } = await client
      .from("signals")
      .select("symbol")
      .eq("direction", "sell")
      .gte("created_at", sinceIso);
    const sellSignalSymbols = new Set((recentSells ?? []).map((s) => s.symbol as string));

    for (const pos of [...openPositions]) {
      // خروج هم روی کوت کهنه ممنوع است — نمی‌شود با قیمت دیروز فروخت. پوزیشن باز می‌ماند
      // و چرخهٔ بعدی که دادهٔ تازه داشته باشد دوباره بررسی می‌کند.
      const q = await freshQuote(pos.symbol);
      if (!q || q.last_price == null || pos.entry_at == null || pos.share_count == null) continue;

      const reason = decideExit({
        hasSellSignal: sellSignalSymbols.has(pos.symbol),
        heldDays: tradingDaysBetween(pos.entry_at, nowIso),
        maxHoldDays: portfolio.max_hold_days,
        currentPrice: q.last_price,
        stopLossPrice: pos.stop_loss_price == null ? null : Number(pos.stop_loss_price),
      });
      if (reason == null) continue;

      const shareCount = Number(pos.share_count);
      const exitDecision = decideSellExecution({
        shareCount,
        entryPrice: Number(pos.entry_price),
        exitPrice: q.last_price,
        buyFeePct,
        sellFeePct,
        exitReason: reason,
        queue: queueState(q),
      });

      if (exitDecision.status === "blocked_locked_sell") {
        // در صف فروش قفل نمی‌شود فروخت — پوزیشن باز می‌ماند، فقط علتش ثبت می‌شود. status
        // دست‌نخورده می‌ماند تا سیکل بعدی همین ردیف را دوباره از decideExit رد کند.
        await client
          .from("virtual_trades")
          .update({ status_note: exitDecision.note, updated_at: nowIso })
          .eq("id", pos.id);
        actions.push(`${pos.symbol}: خروج مسدود (صف فروش)`);
        continue;
      }

      cash += exitDecision.sellNet!;

      await client
        .from("virtual_trades")
        .update({
          status: "closed",
          status_note: null,
          exit_at: nowIso,
          exit_price: q.last_price,
          exit_fee: exitDecision.exitFee,
          exit_reason: reason,
          realized_pnl: exitDecision.pnl,
          return_pct: exitDecision.returnPct,
          updated_at: nowIso,
        })
        .eq("id", pos.id);

      openPositions.splice(openPositions.indexOf(pos), 1);
      actions.push(`${pos.symbol}: closed (${reason}، ${exitDecision.returnPct!.toFixed(2)}٪)`);
    }

    // ── ۳. سیگنال‌های خرید جدید ───────────────────────────────────────────────
    const { data: recentBuys, error: buysError } = await client
      .from("signals")
      .select("id, symbol, reasons, created_at")
      .eq("direction", "buy")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true });
    if (buysError) throw buysError;

    const candidateIds = (recentBuys ?? []).map((s) => s.id as number);
    const { data: alreadyRows } = await client
      .from("virtual_trades")
      .select("signal_id")
      .in("signal_id", candidateIds.length > 0 ? candidateIds : [-1]);
    const already = new Set((alreadyRows ?? []).map((r) => r.signal_id as number));

    const busySymbols = new Set([...openPositions, ...pendingOrders].map((p) => p.symbol));
    const gauge = await latestTensionGauge(client);

    for (const signal of recentBuys ?? []) {
      if (already.has(signal.id as number)) continue;
      const symbol = signal.symbol as string;
      const q = await freshQuote(symbol);
      const staleQuote = q == null ? await latestQuote(symbol) : null;
      const qs = q ? queueState(q) : { lockedBuy: null, lockedSell: null, heavy: null };

      const base = {
        signal_id: signal.id,
        symbol,
        direction: "buy",
        signal_at: signal.created_at,
        signal_price: q?.last_price ?? staleQuote?.last_price ?? null,
        signal_reasons: signal.reasons,
        signal_queue_state: qs,
        signal_market_open: true,
        signal_tension_gauge: gauge,
        created_at: nowIso,
        updated_at: nowIso,
      };

      if (q == null || q.last_price == null) {
        // یا اصلاً کوتی نیست، یا هست ولی مال امروز نیست (تعطیلی ثبت‌نشده / نماد متوقف /
        // قطعی کالکتور). در هر سه حالت اجرا روی این قیمت غلط است.
        const note =
          staleQuote == null
            ? "هیچ کوتی برای این نماد ثبت نشده"
            : `آخرین کوت مال ${staleQuote.captured_at.slice(0, 10)} است، نه امروز — دادهٔ کهنه/تعطیلی یا نماد متوقف`;
        await client.from("virtual_trades").insert({ ...base, status: "rejected_stale_data", status_note: note });
        actions.push(`${symbol}: rejected_stale_data`);
        continue;
      }

      if (busySymbols.has(symbol)) {
        await client.from("virtual_trades").insert({
          ...base,
          status: "rejected_max_positions",
          status_note: "پوزیشن یا سفارش باز روی همین نماد از قبل وجود دارد",
        });
        actions.push(`${symbol}: rejected (پوزیشن تکراری)`);
        continue;
      }

      const desired = await sizePosition(symbol, q.last_price);
      const decision = decideBuyExecution({
        cash,
        openPositionCount: openPositions.length,
        maxConcurrentPositions: Number(risk.max_concurrent_positions),
        desiredShareCount: desired.shareCount,
        price: q.last_price,
        buyFeePct,
        queue: qs,
      });

      const row: Record<string, unknown> = {
        ...base,
        status: decision.status,
        status_note: [decision.note, ...desired.warnings].join(" | "),
      };

      if (decision.status === "executed" || decision.status === "partial") {
        cash -= decision.totalCost;
        row.entry_at = nowIso;
        row.entry_price = q.last_price;
        row.share_count = decision.shareCount;
        row.entry_fee = decision.fee;
        row.stop_loss_price = desired.stopLoss;
        openPositions.push({
          id: -1,
          symbol,
          status: decision.status,
          signal_at: signal.created_at as string,
          entry_at: nowIso,
          entry_price: q.last_price,
          share_count: decision.shareCount,
          stop_loss_price: desired.stopLoss,
          queue_wait_days: 0,
        });
        busySymbols.add(symbol);
      } else if (decision.status === "pending_queue") {
        row.stop_loss_price = desired.stopLoss;
        busySymbols.add(symbol);
      }

      const { error: insertError } = await client.from("virtual_trades").insert(row);
      if (insertError) throw insertError;
      actions.push(`${symbol}: ${decision.status}`);
    }

    await client.from("virtual_portfolio").update({ cash, updated_at: nowIso }).eq("id", 1);

    const latencyMs = Math.round(performance.now() - start);
    await logHealth(
      client,
      "execute-virtual-trades",
      "ok",
      actions.length > 0 ? actions.join("، ") : "بدون تغییر",
      latencyMs,
    );

    return new Response(JSON.stringify({ ok: true, cash, actions }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    await logHealth(client, "execute-virtual-trades", "error", message, latencyMs);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

async function latestTensionGauge(client: ReturnType<typeof createServiceClient>): Promise<number | null> {
  const { data } = await client
    .from("global_quotes")
    .select("price")
    .eq("asset", "tension_index")
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.price == null ? null : Number(data.price);
}
