import { NextRequest, NextResponse } from "next/server";
import { buildSystemPrompt } from "@/lib/chat/systemPrompt.ts";
import { proposePaperTrade } from "@/lib/chat/proposePaperTrade.ts";
import { getSignalDisclaimerText } from "@/lib/chat/context.ts";

/**
 * app/api/chat/route.ts
 *
 * API endpoint برای چت دستیار بورس.
 *
 * - سیستم پرامپت را بناسازی می‌کند (context + قواعد)
 * - مدل (Groq) را صدا می‌زند
 * - tool call‌ها (proposePaperTrade) را handle می‌کند
 * - disclaimer را افزودی می‌کند (قید #2 spec v1)
 */

interface ChatRequest {
  message: string;
  context?: Record<string, unknown> | string | null;
  pageName?: string;
}

interface ToolCallResult {
  type: string;
  result?: unknown;
}

async function callGroq(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY محل تعریف نشده است");
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mixtral-8x7b-32768",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatRequest;
    const { message, context, pageName } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "message فیلد ضروری است" },
        { status: 400 }
      );
    }

    // سیستم پرامپت
    const contextJson = context ? (typeof context === "string" ? context : JSON.stringify(context)) : null;
    const systemPrompt = buildSystemPrompt({ pageContextJson: contextJson, pageName });

    // مدل Groq
    let modelResponse = await callGroq(systemPrompt, message);

    // بررسی tool call (proposePaperTrade)
    let toolCall: ToolCallResult | null = null;
    if (
      context &&
      typeof context === "object" &&
      "symbol" in context &&
      "direction" in context &&
      context.direction === "buy"
    ) {
      // اگر کاربر درخواست پوزیشن برای یک سیگنال خرید داد
      const proposal = await proposePaperTrade(
        context.symbol as string,
        (context as any).entryPrice || ((context as any).lastPrice?.price ?? 0)
      );

      if (proposal.status === "success" && proposal.proposal) {
        toolCall = { type: "proposePaperTrade", result: proposal };
      }
    }

    // disclaimer اضافہ (قید #2 spec v1)
    const disclaimer = "\n\n---\n*" + getSignalDisclaimerText() + "*";
    const finalResponse = modelResponse + disclaimer;

    return NextResponse.json({
      message: finalResponse,
      toolCall: toolCall || undefined,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: `خطا: ${error instanceof Error ? error.message : "نامعلوم"}` },
      { status: 500 }
    );
  }
}
