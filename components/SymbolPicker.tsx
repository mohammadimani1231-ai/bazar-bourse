"use client";

import { useState } from "react";

export interface SymbolOption {
  symbol: string;
  companyName: string | null;
}

/**
 * انتخاب نماد با جست‌وجو (نه تایپ آزاد) — تایپ آزاد یعنی یک فاصلهٔ اضافه یا غلط تایپی نماد را
 * از واچ‌لیست خارج می‌کند (بازخورد کاربر). لیست از واچ‌لیست (با نام شرکت) فیلتر می‌شود.
 */
export function SymbolPicker({
  options,
  value,
  onChange,
  className,
}: {
  options: SymbolOption[];
  value: string;
  onChange: (symbol: string) => void;
  className?: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  const filtered =
    query.trim() === ""
      ? options
      : options.filter(
          (o) => o.symbol.includes(query.trim()) || (o.companyName ?? "").includes(query.trim()),
        );

  const select = (option: SymbolOption) => {
    onChange(option.symbol);
    setQuery(option.symbol);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        className={className}
        value={query}
        placeholder="جست‌وجوی نماد یا نام شرکت..."
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(""); // تا انتخاب واقعی از لیست، نماد نامعتبر است — نمی‌شود تایپ آزاد ثبت کرد
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-56 overflow-y-auto rounded-md border border-border bg-surface-2 text-xs shadow-lg">
          {filtered.slice(0, 30).map((o) => (
            <li key={o.symbol}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(o)}
                className="flex w-full flex-col items-start gap-0.5 px-2 py-1.5 text-right hover:bg-surface"
              >
                <span className="font-bold">{o.symbol}</span>
                {o.companyName && <span className="text-[10px] text-muted">{o.companyName}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
