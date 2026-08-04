"use client";

import type { RangeFilter } from "@/lib/screenerFilters.ts";
import { formatFaNumber } from "@/lib/format.ts";

export function RangeSliderFilter({
  label,
  bounds,
  step = 1,
  value,
  onChange,
}: {
  label: string;
  bounds: [number, number];
  step?: number;
  value: RangeFilter;
  onChange: (next: RangeFilter) => void;
}) {
  const [lo, hi] = bounds;
  const minVal = value.min ?? lo;
  const maxVal = value.max ?? hi;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="ltr-nums text-muted">
          {formatFaNumber(minVal, 2)} تا {formatFaNumber(maxVal, 2)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={lo}
          max={hi}
          step={step}
          value={minVal}
          onChange={(e) => {
            const next = Math.min(Number(e.target.value), maxVal);
            onChange({ min: next === lo ? null : next, max: value.max });
          }}
          className="w-full accent-[var(--color-accent)]"
        />
        <input
          type="range"
          min={lo}
          max={hi}
          step={step}
          value={maxVal}
          onChange={(e) => {
            const next = Math.max(Number(e.target.value), minVal);
            onChange({ min: value.min, max: next === hi ? null : next });
          }}
          className="w-full accent-[var(--color-accent)]"
        />
      </div>
    </div>
  );
}
