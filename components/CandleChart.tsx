"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  type UTCTimestamp,
} from "lightweight-charts";

export interface CandlePoint {
  date: string; // yyyy-mm-dd
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
}

export interface SignalMarker {
  date: string;
  direction: string;
}

function toTimestamp(dateStr: string): UTCTimestamp {
  return (Date.parse(dateStr + "T00:00:00Z") / 1000) as UTCTimestamp;
}

export function CandleChart({
  candles,
  signalMarkers,
}: {
  candles: CandlePoint[];
  signalMarkers: SignalMarker[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: { background: { color: "transparent" }, textColor: "#9a9aa5" },
      grid: { vertLines: { color: "#2a2a33" }, horzLines: { color: "#2a2a33" } },
      rightPriceScale: { borderColor: "#2a2a33" },
      timeScale: { borderColor: "#2a2a33" },
      autoSize: true,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const data = candles
      .filter((c) => c.open != null && c.high != null && c.low != null && c.close != null)
      .map((c) => ({
        time: toTimestamp(c.date),
        open: c.open!,
        high: c.high!,
        low: c.low!,
        close: c.close!,
      }));
    series.setData(data);

    if (signalMarkers.length > 0) {
      const markers = signalMarkers.map((m) => ({
        time: toTimestamp(m.date),
        position: (m.direction === "sell" ? "aboveBar" : "belowBar") as "aboveBar" | "belowBar",
        color: m.direction === "sell" ? "#ef4444" : "#22c55e",
        shape: (m.direction === "sell" ? "arrowDown" : "arrowUp") as "arrowDown" | "arrowUp",
      }));
      createSeriesMarkers(series, markers);
    }

    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [candles, signalMarkers]);

  return <div ref={containerRef} style={{ height: 420, width: "100%" }} />;
}
