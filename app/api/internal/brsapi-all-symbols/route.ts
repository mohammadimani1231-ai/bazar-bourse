import { type NextRequest } from "next/server";
import { fetchBrsApiAllSymbols } from "@/lib/data-sources/brsapi.ts";

export const dynamic = "force-dynamic";
// fetchBrsApiAllSymbols می‌تواند تا حدود ۲۰ ثانیه طول بکشد (۲ تلاش با connect timeout ~۱۰ ثانیه‌ای
// undici) — پیش‌فرض Vercel (۱۰ ثانیه) کافی نیست.
export const maxDuration = 30;

/**
 * پروکسی داخلی برای collect-tse (Supabase Edge Function): وقتی تماس مستقیم آن با BrsApi از
 * IP خود Supabase شکست بخورد، از IP/ASN جدای Vercel همین دادهٔ خام را می‌گیرد. فقط با هدر
 * سرّی مشترک (`BRSAPI_PROXY_SECRET`، هم در Vercel هم در Supabase secrets) قابل فراخوانی است —
 * بدون کوکی سشن، چون caller خودش یک Edge Function است نه مرورگر (به همین دلیل هم در proxy.ts
 * از گیت رمز مشترک سایت استثنا شده).
 */
export async function GET(request: NextRequest) {
  const expectedSecret = process.env.BRSAPI_PROXY_SECRET;
  const providedSecret = request.headers.get("x-proxy-secret");

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const apiKey = process.env.BRSAPI_KEY ?? "";

  try {
    const rows = await fetchBrsApiAllSymbols(apiKey);
    return Response.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // cause دیاگنوستیک واقعی undici (ECONNREFUSED/ETIMEDOUT/گواهی و...) را دارد؛ خودِ message
    // اغلب فقط «fetch failed» است — برای عیب‌یابی این مسیر مفید نگه داشته شده.
    const cause = err instanceof Error && err.cause ? String(err.cause) : null;
    return Response.json({ error: message, cause }, { status: 502 });
  }
}
