/** ارسال پیام به تلگرام — اگر توکن/چت‌آی‌دی ست نشده بود، ساکت false برمی‌گرداند نه throw. */
export async function sendTelegramMessage(text: string): Promise<boolean> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chatId) return false;

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
    throw new Error(`telegram sendMessage failed: ${res.status} ${body}`);
  }
  return true;
}
