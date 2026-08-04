"use client";

import { resolveRefSection } from "@/lib/refResolver.ts";

export function RefTooltip({ refPath, inputSnapshot }: { refPath: string; inputSnapshot: Record<string, unknown> }) {
  const section = resolveRefSection(refPath, inputSnapshot);

  return (
    <details className="inline-block align-middle">
      <summary className="inline cursor-pointer list-none text-[10px] text-accent underline decoration-dotted">
        منبع: {refPath}
      </summary>
      <div className="mt-1 max-w-md overflow-x-auto rounded border border-border bg-surface-2 p-2">
        {section === undefined ? (
          <p className="text-[10px] text-muted">این بخش در دادهٔ ورودی پیدا نشد.</p>
        ) : (
          <pre className="ltr-nums text-[10px] text-muted" dir="ltr">
            {JSON.stringify(section, null, 2)}
          </pre>
        )}
      </div>
    </details>
  );
}
