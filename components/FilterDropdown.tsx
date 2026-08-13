"use client";

import type { RangeFilter } from "@/lib/screenerFilters.ts";

export interface FilterDropdownOption {
  label: string;
  range: RangeFilter;
}

/**
 * فیلتر با dropdown و بازه‌های از‌پیش‌تعیین‌شده — الگوی اسکرینر Finviz: ده‌ها فیلتر هم‌زمان
 * قابل نمایش بدون شلوغی، چون هرکدام فقط یک select کوچک است، نه اسلایدر تمام‌عرض.
 */
export function FilterDropdown({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: FilterDropdownOption[];
  value: RangeFilter;
  onChange: (range: RangeFilter) => void;
}) {
  const selectedIndex = options.findIndex((o) => o.range.min === value.min && o.range.max === value.max);

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-muted">{label}</span>
      <select
        value={selectedIndex === -1 ? 0 : selectedIndex}
        onChange={(e) => onChange(options[Number(e.target.value)].range)}
        className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs text-foreground transition-colors hover:border-accent/50 focus:border-accent focus:outline-none"
      >
        {options.map((o, i) => (
          <option key={i} value={i}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
