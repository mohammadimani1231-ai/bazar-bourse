"use client";

import { useState } from "react";
import { CandleChart, type CandlePoint, type SignalMarker, type NewsMarker } from "@/components/CandleChart";
import { IntradayFlowChart, type IntradayPoint } from "@/components/IntradayFlowChart";
import { QueueFlags, type QueueFlagsData } from "@/components/QueueFlags";
import { SignalHistoryList, type SignalHistoryItem } from "@/components/SignalHistoryList";
import { EmptyState } from "@/components/EmptyState";
import { BarChart3, Activity, History } from "lucide-react";

type Tab = "chart" | "tabloo" | "signals";

const TABS: { key: Tab; label: string }[] = [
  { key: "chart", label: "چارت روزانه" },
  { key: "tabloo", label: "تابلوخوانی" },
  { key: "signals", label: "سیگنال‌ها" },
];

/**
 * تب‌بندی محتوای صفحهٔ نماد (الگوی Yahoo Finance) — چارت/تابلوخوانی/سیگنال‌ها در یک نگاه
 * شلوغ نمی‌شوند، هرکدام فقط با یک کلیک در دسترس‌اند.
 */
export function SymbolTabs({
  candles,
  signalMarkers,
  newsMarkers,
  intradayPoints,
  queueFlags,
  signalHistoryItems,
}: {
  candles: CandlePoint[];
  signalMarkers: SignalMarker[];
  newsMarkers: NewsMarker[];
  intradayPoints: IntradayPoint[];
  queueFlags: QueueFlagsData;
  signalHistoryItems: SignalHistoryItem[];
}) {
  const [tab, setTab] = useState<Tab>("chart");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-fit gap-1 rounded-lg border border-border bg-surface p-1 text-sm shadow-card">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1.5 ${tab === key ? "bg-accent text-white" : "text-muted hover:bg-surface-2"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "chart" && (
        <div className="rounded-lg border border-border bg-surface shadow-card p-3">
          <h2 className="mb-2 text-sm font-bold">کندل روزانه</h2>
          {candles.length > 0 ? (
            <>
              <CandleChart candles={candles} signalMarkers={signalMarkers} newsMarkers={newsMarkers} />
              <p className="mt-2 text-[11px] text-muted">
                فلش سبز/قرمز = سیگنال خرید/فروش، دایرهٔ آبی «خبر» = رویداد ژئوپلیتیک/اقتصادی (کل بازار، نه لزوماً این نماد) — کلیک برای لینک.
              </p>
            </>
          ) : (
            <EmptyState icon={BarChart3} title="کندلی ثبت نشده" description="هنوز داده‌ای تاریخی برای این نماد در سیستم نیست." />
          )}
        </div>
      )}

      {tab === "tabloo" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface shadow-card p-3">
            <h2 className="mb-2 text-sm font-bold">سری‌زمانی درون‌روز</h2>
            {intradayPoints.length > 0 ? (
              <IntradayFlowChart points={intradayPoints} />
            ) : (
              <EmptyState icon={Activity} title="دیتای درون‌روزی نیست" description="هنوز دیتای تابلوخوانی امروز برای این نماد ثبت نشده." />
            )}
          </div>
          <QueueFlags data={queueFlags} />
        </div>
      )}

      {tab === "signals" && (
        <div className="rounded-lg border border-border bg-surface shadow-card p-3">
          <h2 className="mb-2 text-sm font-bold">تاریخچهٔ سیگنال‌ها</h2>
          {signalHistoryItems.length > 0 ? (
            <SignalHistoryList items={signalHistoryItems} />
          ) : (
            <EmptyState icon={History} title="سیگنالی ثبت نشده" description="هنوز سیگنالی برای این نماد صادر نشده." />
          )}
        </div>
      )}
    </div>
  );
}
