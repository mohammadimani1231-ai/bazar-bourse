const CONFIDENCE_STYLES: Record<string, string> = {
  "قطعی از داده": "bg-up/20 text-up",
  "استنتاج قوی": "bg-accent/20 text-accent",
  "گمانه": "bg-amber-500/20 text-amber-500",
};

export function BriefConfidenceBadge({ confidence }: { confidence: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] ${CONFIDENCE_STYLES[confidence] ?? "bg-surface-2 text-muted"}`}>
      {confidence}
    </span>
  );
}
