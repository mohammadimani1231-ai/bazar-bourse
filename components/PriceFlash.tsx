"use client";

import { useEffect, useRef, useState } from "react";

const FLASH_DURATION_MS = 600;

/**
 * فلش رنگی کوتاه هنگام تغییر مقدار — نه چشمک‌زن دائمی (الهام Robinhood). پس‌زمینهٔ فرزندان
 * برای یک لحظه سبز/قرمز می‌شود و محو برمی‌گردد؛ جهت را از علامت تغییر مقدار تشخیص می‌دهد.
 */
export function PriceFlash({ value, children }: { value: number | null; children: React.ReactNode }) {
  const prevValue = useRef(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (value != null && prevValue.current != null && value !== prevValue.current) {
      setFlash(value > prevValue.current ? "up" : "down");
      const timer = setTimeout(() => setFlash(null), FLASH_DURATION_MS);
      prevValue.current = value;
      return () => clearTimeout(timer);
    }
    prevValue.current = value;
  }, [value]);

  return (
    <span
      className={`motion-reduce:transition-none rounded transition-colors duration-500 ${
        flash === "up" ? "bg-up/20" : flash === "down" ? "bg-down/20" : "bg-transparent"
      }`}
    >
      {children}
    </span>
  );
}
