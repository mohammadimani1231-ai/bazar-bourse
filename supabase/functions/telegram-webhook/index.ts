import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";

/**
 * دریافت پیام‌های ورودی بات تلگرام (webhook) — تنها راه ثبت خودکار مشترک جدید.
 * verify_jwt برای این تابع در config.toml خاموش است (Telegram هیچ JWT سوپابیسی نمی‌فرستد)؛
 * امنیتش به‌جایش با هدر X-Telegram-Bot-Api-Secret-Token (که خودمان هنگام setWebhook تعیین
 * می‌کنیم) تأمین می‌شود.
 *
 * راه‌اندازی یک‌بارمصرف: GET با query param ?register=<TELEGRAM_WEBHOOK_SECRET> این تابع را
 * به‌عنوان webhook در Telegram ثبت می‌کند (از داخل خود Edge Function، چون TELEGRAM_BOT_TOKEN
 * فقط داخل محیط اجرا در دسترس است، نه جایی که ما بتوانیم مستقیم بخوانیمش).
 */

interface TelegramUpdate {
  message?: {
    chat: { id: number; username?: string; first_name?: string };
    text?: string;
  };
}

Deno.serve(async (req) => {
  const start = performance.now();
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  const inviteCode = Deno.env.get("TELEGRAM_INVITE_CODE");

  if (!token || !webhookSecret) {
    return new Response("TELEGRAM_BOT_TOKEN/TELEGRAM_WEBHOOK_SECRET تنظیم نشده", { status: 500 });
  }

  const url = new URL(req.url);

  // ثبت یک‌بارمصرف webhook — فقط دستی صدا زده می‌شود، نه توسط Telegram.
  // req.url پشت پروکسی Edge Runtime آدرس عمومی واقعی را نمی‌دهد (تست زنده: "bad webhook")،
  // پس آدرس عمومی را از روی الگوی ثابت Supabase Functions می‌سازیم، نه از url.origin.
  if (req.method === "GET" && url.searchParams.get("register") === webhookSecret) {
    const projectRef = Deno.env.get("SUPABASE_URL")!.match(/https:\/\/([^.]+)\./)![1];
    const webhookUrl = `https://${projectRef}.supabase.co/functions/v1/telegram-webhook`;
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, secret_token: webhookSecret }),
    });
    const result = await res.json();
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== webhookSecret) {
    return new Response("Forbidden", { status: 403 });
  }

  const client = createServiceClient();

  try {
    const update = (await req.json()) as TelegramUpdate;
    const chat = update.message?.chat;
    const text = update.message?.text?.trim() ?? "";

    if (chat) {
      if (text.startsWith("/start")) {
        const providedCode = text.slice("/start".length).trim();
        if (!inviteCode || providedCode === inviteCode) {
          await client.from("telegram_subscribers").upsert({
            chat_id: chat.id,
            username: chat.username ?? null,
            first_name: chat.first_name ?? null,
            active: true,
          });
          await sendReply(token, chat.id, "✅ ثبت شدید — از این پس هشدارها و گزارش‌های داشبورد بورس برای شما ارسال می‌شود.");
        } else {
          await sendReply(token, chat.id, "کد دعوت اشتباه است. لطفاً به‌صورت «/start کد_دعوت» دوباره امتحان کنید.");
        }
      } else if (text.startsWith("/stop")) {
        await client.from("telegram_subscribers").update({ active: false }).eq("chat_id", chat.id);
        await sendReply(token, chat.id, "اشتراک شما لغو شد. برای فعال‌سازی دوباره /start را بزنید.");
      }
    }

    const latencyMs = Math.round(performance.now() - start);
    await logHealth(client, "telegram-webhook", "ok", text.split(" ")[0] || "(no text)", latencyMs);
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const latencyMs = Math.round(performance.now() - start);
    await logHealth(client, "telegram-webhook", "error", message, latencyMs);
    // همیشه 200 به Telegram برمی‌گردانیم — وگرنه Telegram با retry مکرر همان update را دوباره می‌فرستد.
    return new Response(JSON.stringify({ ok: false }), { headers: { "Content-Type": "application/json" } });
  }
});

async function sendReply(token: string, chatId: number, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
