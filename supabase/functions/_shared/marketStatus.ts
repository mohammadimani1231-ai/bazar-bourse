import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isMarketOpen, wasTodayTradingDay, type MarketStatusResult } from "../../../lib/market-status.ts";
import { tehranDayBounds } from "../../../lib/time/tehranDay.ts";

/** نماد پرمعاملهٔ مرجع برای heuristic «تغییر حجم اخیر» در lib/market-status.ts. */
const REFERENCE_SYMBOL = "فملی";

/** ورودی‌های lib/market-status.ts را از DB می‌خواند و isMarketOpen را صدا می‌زند. */
export async function checkMarketOpen(client: SupabaseClient): Promise<MarketStatusResult> {
  const now = new Date();

  const { data: holidayRows } = await client.from("market_holidays").select("date");
  const holidayDates = new Set((holidayRows ?? []).map((r: { date: string }) => r.date));

  const { data: recent } = await client
    .from("quotes")
    .select("captured_at, volume")
    .eq("symbol", REFERENCE_SYMBOL)
    .order("captured_at", { ascending: false })
    .limit(5);

  const recentVolumes = (recent ?? []).map((r: { captured_at: string; volume: number | null }) => ({
    capturedAt: r.captured_at,
    volume: r.volume,
  }));

  return isMarketOpen({ nowUtc: now, holidayDates, recentVolumes });
}

/**
 * فقط بازهٔ نظری + جدول تعطیلات را چک می‌کند، بدون heuristic تغییر حجم — مخصوص collect-tse
 * که خودش منبع دادهٔ آن heuristic است (وگرنه اگر یک روز اسکیپ کند، تشخیص «بازار دوباره باز شد»
 * هیچ‌وقت دادهٔ تازه‌ای برای مقایسه نمی‌بیند و در حالت بسته گیر می‌کند).
 */
export async function checkMarketOpenLight(client: SupabaseClient): Promise<MarketStatusResult> {
  const now = new Date();
  const { data: holidayRows } = await client.from("market_holidays").select("date");
  const holidayDates = new Set((holidayRows ?? []).map((r: { date: string }) => r.date));
  return isMarketOpen({ nowUtc: now, holidayDates, recentVolumes: [] });
}

/**
 * برای jobهای شبانه (build-candles، compute-rank) که بعد از ساعات بازار اجرا می‌شوند —
 * «امروز روز معاملاتی بود؟» نه «همین الان بازار باز است؟». اسنپ‌شات‌های کل امروزِ نماد
 * مرجع را هم می‌بیند تا تعطیلی‌های اعلامی/نامنظم بدون نیاز به جدول تعطیلات هم تشخیص داده شوند.
 */
export async function checkTodayWasTradingDay(client: SupabaseClient): Promise<boolean> {
  const now = new Date();
  const { data: holidayRows } = await client.from("market_holidays").select("date");
  const holidayDates = new Set((holidayRows ?? []).map((r: { date: string }) => r.date));

  const { startUtc, endUtc } = tehranDayBounds(now);
  const { data: todayRows } = await client
    .from("quotes")
    .select("captured_at, volume")
    .eq("symbol", REFERENCE_SYMBOL)
    .gte("captured_at", startUtc)
    .lt("captured_at", endUtc)
    .order("captured_at", { ascending: true });

  const todayVolumes = (todayRows ?? []).map((r: { captured_at: string; volume: number | null }) => ({
    capturedAt: r.captured_at,
    volume: r.volume,
  }));

  return wasTodayTradingDay(now, holidayDates, todayVolumes);
}
