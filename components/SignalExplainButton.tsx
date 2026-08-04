"use client";

import { useState } from "react";
import { explainSignalFactors, type RuleEvaluationLike } from "@/lib/signalExplain.ts";

export function SignalExplainButton({ reasons }: { reasons: RuleEvaluationLike[] }) {
  const [open, setOpen] = useState(false);
  const explanations = explainSignalFactors(reasons);

  return (
    <span className="inline-block">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:bg-surface-2"
      >
        توضیح بده
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-1 rounded border border-border bg-surface-2 p-2">
          {explanations.length === 0 ? (
            <p className="text-[10px] text-muted">فاکتور trigger‌شده‌ای برای توضیح نیست.</p>
          ) : (
            explanations.map((text, i) => (
              <p key={i} className="text-[10px] text-muted">
                • {text}
              </p>
            ))
          )}
        </div>
      )}
    </span>
  );
}
