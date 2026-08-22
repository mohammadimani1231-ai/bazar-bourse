"use client";

import { useState, useRef, useEffect } from "react";
import { Loader2, Send } from "lucide-react";
import { confirmProposedTrade } from "@/app/actions/confirmProposedTrade";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatAssistantProps {
  pageContext?: Record<string, unknown> | string | null;
  pageName?: string;
  suggestedQuestions?: string[];
}

/**
 * کامپوننت UI چت دستیار بورس.
 *
 * - پیام‌های کاربر و مدل را نمایش می‌دهد
 * - disclaimer را هر بار نمایش می‌دهد (قید #2 spec v1)
 * - پیشنهادات میل شامل کارتِ تایید + دکمهٔ «ثبت» (فقط کلیک می‌توانند openPaperTrade صدا بزند)
 */
export function ChatAssistant({
  pageContext,
  pageName,
  suggestedQuestions = [],
}: ChatAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (userMessage: string) => {
    if (!userMessage.trim()) return;

    // افزودن پیام کاربر
    const newUserMessage: Message = {
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newUserMessage]);
    setInput("");
    setLoading(true);

    try {
      // فراخوانی API
      const contextValue = typeof pageContext === "string" ? JSON.parse(pageContext) : pageContext;
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          context: contextValue,
          pageName,
        }),
      });

      if (!response.ok) {
        throw new Error("خطای سرور در دریافت پاسخ");
      }

      const data = await response.json();
      const assistantMessage: Message = {
        role: "assistant",
        content: data.message,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // اگر toolCall موجود بود، نمایش کارت پیشنهاد
      if (data.toolCall?.type === "proposePaperTrade" && data.toolCall?.result?.proposal) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: JSON.stringify({
              type: "proposal",
              data: data.toolCall.result.proposal,
            }),
            timestamp: new Date(),
          },
        ]);
      }
    } catch (error) {
      const errorMessage: Message = {
        role: "assistant",
        content: `خطا: ${error instanceof Error ? error.message : "نامعلوم"}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col max-h-96 border rounded-lg bg-background">
      {/* پیام‌ها */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground">
            <p>سلام! سوال‌های خود درباره‌ی سیگنال‌ها، پوزیشن، یا بازار بپرسید.</p>
            {suggestedQuestions.length > 0 && (
              <div className="mt-4 space-y-2">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendMessage(q)}
                    className="block w-full text-sm text-blue-500 hover:underline truncate"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => {
          // پارس کارتِ proposal
          let isProposal = false;
          let proposalData = null;
          try {
            const parsed = JSON.parse(msg.content);
            if (parsed.type === "proposal") {
              isProposal = true;
              proposalData = parsed.data;
            }
          } catch {
            // عادی
          }

          if (isProposal && proposalData) {
            return (
              <div key={i} className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm space-y-2">
                  <p className="font-bold text-blue-900">پیشنهاد اندازهٔ پوزیشن</p>
                  <p>نماد: <span className="font-mono">{proposalData.symbol}</span></p>
                  <p>قیمت ورود: <span className="font-mono">{proposalData.entryPrice.toLocaleString()}</span> تومان</p>
                  <p>تعداد سهم: <span className="font-mono">{proposalData.suggestedShareCount}</span></p>
                  <p>حد ضرر: <span className="font-mono">{proposalData.suggestedStopLoss.toFixed(0)}</span> تومان</p>
                  <p>ریسک: <span className="font-mono">{proposalData.capitalAtRisk.toLocaleString()}</span> تومان</p>
                  {proposalData.warnings.length > 0 && (
                    <div className="text-yellow-700 text-xs">
                      <p className="font-bold">هشدارها:</p>
                      <ul className="list-disc list-inside">
                        {proposalData.warnings.map((w: string, j: number) => (
                          <li key={j}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-xs text-gray-600 italic">{proposalData.disclaimerText}</p>
                  <button
                    className="w-full mt-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded"
                    onClick={async () => {
                      try {
                        // re-validation قبل از ثبت
                        const result = await confirmProposedTrade(
                          proposalData.symbol,
                          proposalData.entryPrice
                        );

                        if (result.status === "success") {
                          setMessages((prev) => [
                            ...prev,
                            {
                              role: "assistant",
                              content: `معامله برای ${proposalData.symbol} با موفقیت ثبت شد.`,
                              timestamp: new Date(),
                            },
                          ]);
                        } else if (result.status === "partial") {
                          setMessages((prev) => [
                            ...prev,
                            {
                              role: "assistant",
                              content: `هشدار: معامله جزئی اجرا شد. ${result.error || ""}`,
                              timestamp: new Date(),
                            },
                          ]);
                        } else {
                          setMessages((prev) => [
                            ...prev,
                            {
                              role: "assistant",
                              content: `خطا: ${result.error || "نامعلوم"}${
                                result.shouldRetry ? " (دوباره تلاش کنید)" : ""
                              }`,
                              timestamp: new Date(),
                            },
                          ]);
                        }
                      } catch (error) {
                        setMessages((prev) => [
                          ...prev,
                          {
                            role: "assistant",
                            content: `خطا: ${error instanceof Error ? error.message : "نامعلوم"}`,
                            timestamp: new Date(),
                          },
                        ]);
                      }
                    }}
                  >
                    ثبت معامله
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-xs px-3 py-2 rounded-lg ${
                  msg.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-900"
                }`}
              >
                <p className="text-sm">{msg.content}</p>
                <p className="text-xs opacity-70 mt-1">
                  {msg.timestamp.toLocaleTimeString("fa-IR")}
                </p>
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex items-center space-x-2 text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <p className="text-sm">در حال پاسخ...</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ورودی */}
      <div className="border-t p-4 flex gap-2">
        <input
          value={input}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage(input);
            }
          }}
          placeholder="سوال بپرسید..."
          disabled={loading}
          className="flex-1 text-sm px-3 py-2 border border-border rounded bg-background text-foreground placeholder-muted-foreground"
        />
        <button
          onClick={() => handleSendMessage(input)}
          disabled={loading || !input.trim()}
          className="px-3 py-2 bg-accent text-white rounded hover:bg-accent/80 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
