async function sendToChatId(token: string, chatId: string | number, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`telegram sendMessage failed for chat ${chatId}: ${res.status} ${body}`);
  }
}

/**
 * ارسال پیام به تلگرام — به `TELEGRAM_CHAT_ID` (اگر ست شده بود، برای سازگاری با راه‌اندازی
 * تک‌کاربرهٔ اولیه) به‌علاوهٔ همهٔ ردیف‌های فعال `telegram_subscribers` (بات چندکاربره،
 * ثبت‌شده از طریق /start در supabase/functions/telegram-webhook). اگر هیچ‌کدام موجود نبود،
 * ساکت false برمی‌گرداند نه throw — خطای یک گیرنده نباید بقیه را متوقف کند.
 */
export async function sendTelegramMessage(text: string): Promise<boolean> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return false;

  const recipients = new Set<string>();
  const primaryChatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (primaryChatId) recipients.add(primaryChatId);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (supabaseUrl && serviceKey) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/telegram_subscribers?select=chat_id&active=eq.true`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (res.ok) {
        const rows = (await res.json()) as { chat_id: number }[];
        for (const row of rows) recipients.add(String(row.chat_id));
      }
    } catch {
      // نبود دسترسی به لیست مشترکین نباید مانع ارسال به TELEGRAM_CHAT_ID شود
    }
  }

  if (recipients.size === 0) return false;

  let anySent = false;
  for (const chatId of recipients) {
    try {
      await sendToChatId(token, chatId, text);
      anySent = true;
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
    }
  }
  return anySent;
}
