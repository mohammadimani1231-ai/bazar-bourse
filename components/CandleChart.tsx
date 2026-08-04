"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  type UTCTimestamp,
  type MouseEventParams,
  type Time,
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

export interface NewsMarker {
  date: string;
  title: string;
  url: string;
}

function toTimestamp(dateStr: string): UTCTimestamp {
  return (Date.parse(dateStr + "T00:00:00Z") / 1000) as UTCTimestamp;
}

export function CandleChart({
  candles,
  signalMarkers,
  newsMarkers = [],
}: {
  candles: CandlePoint[];
  signalMarkers: SignalMarker[];
  newsMarkers?: NewsMarker[];
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

    const signalMarkerList = signalMarkers.map((m) => ({
      time: toTimestamp(m.date),
      position: (m.direction === "sell" ? "aboveBar" : "belowBar") as "aboveBar" | "belowBar",
      color: m.direction === "sell" ? "#ef4444" : "#22c55e",
      shape: (m.direction === "sell" ? "arrowDown" : "arrowUp") as "arrowDown" | "arrowUp",
    }));

    // چند خبر هم‌روز ممکن است — روی همان زمان یکی نمایش داده می‌شود، لینکش در newsByTime نگه‌داشته می‌شود
    const newsByTime = new Map<number, NewsMarker>();
    for (const n of newsMarkers) newsByTime.set(toTimestamp(n.date), n);
    const newsMarkerList = [...newsByTime.entries()].map(([time, n]) => ({
      time: time as UTCTimestamp,
      position: "aboveBar" as const,
      color: "#6366f1",
      shape: "circle" as const,
      text: "خبر",
      size: 0.6,
      _news: n,
    }));

    const allMarkers = [...signalMarkerList, ...newsMarkerList].sort((a, b) => (a.time as number) - (b.time as number));
    if (allMarkers.length > 0) createSeriesMarkers(series, allMarkers);

    const clickHandler = (param: MouseEventParams<Time>) => {
      if (param.time == null) return;
      const news = newsByTime.get(param.time as number);
      if (news) window.open(news.url, "_blank", "noopener,noreferrer");
    };
    chart.subscribeClick(clickHandler);

    chart.timeScale().fitContent();

    return () => {
      chart.unsubscribeClick(clickHandler);
      chart.remove();
    };
  }, [candles, signalMarkers, newsMarkers]);

  return <div ref={containerRef} style={{ height: 420, width: "100%" }} />;
}
