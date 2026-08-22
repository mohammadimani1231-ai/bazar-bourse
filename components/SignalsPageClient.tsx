"use client";

import { useState, useEffect } from "react";
import { SignalsTabs } from "@/components/SignalsTabs";
import { ChatAssistant } from "@/components/ChatAssistant";
import type { SignalRow } from "@/components/SignalsTable";
import { fetchSignalContext } from "@/app/signals/actions";
import type { SignalsPageContextData } from "@/lib/chat/context";

interface SignalsPageClientProps {
  initialSignals: SignalRow[];
  ruleStats: any;
  scorePoints: any;
}

export function SignalsPageClient({
  initialSignals,
  ruleStats,
  scorePoints,
}: SignalsPageClientProps) {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedContext, setSelectedContext] = useState<SignalsPageContextData | null>(null);

  useEffect(() => {
    if (selectedSymbol) {
      fetchSignalContext(selectedSymbol).then(setSelectedContext);
    } else {
      setSelectedContext(null);
    }
  }, [selectedSymbol]);

  const suggestedQuestions = [
    "چرا سیستم امروز این سیگنال رو برای این سهم صادر کرد؟",
    "این سیگنال بر چه فاکتورهایی مبتنیه؟",
    "با توجه به این سیگنال، الان بخرم؟",
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* سیگنال‌ها */}
        <div className="lg:col-span-2">
          <SignalsTabs
            initialSignals={initialSignals}
            ruleStats={ruleStats}
            scorePoints={scorePoints}
            onSelectSymbol={setSelectedSymbol}
          />
        </div>

        {/* چت دستیار */}
        <div className="lg:col-span-1">
          <ChatAssistant
            pageContext={selectedContext ? JSON.stringify(selectedContext) : null}
            pageName="سیگنال‌ها"
            suggestedQuestions={suggestedQuestions}
          />
        </div>
      </div>
    </div>
  );
}
