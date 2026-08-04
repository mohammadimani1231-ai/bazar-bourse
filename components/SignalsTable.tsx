"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/browserClient.ts";
import { formatJalaliDateTime } from "@/lib/jalali.ts";
import { formatFaNumber } from "@/lib/format.ts";
import { toCsv } from "@/lib/csv.ts";
import { ExportCsvButton } from "@/components/ExportCsvButton";

export interface RuleEvaluationLike {
  rule: string;
  triggered: boolean;
  contribution: number;
}

export interface SignalRow {
  id: number;
  symbol: string;
  direction: string;
  score: number;
  reasons: RuleEvaluationLike[];
  regime: string;
  createdAt: string;
}

const MAX_ROWS = 150;

function directionLabel(direction: string): string {
  if (direction === "buy") return "خرید";
  if (direction === "sell") return "فروش";
  return direction;
}

export function SignalsTable({ initial }: { initial: SignalRow[] }) {
  const [rows, setRows] = useState(initial);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel("signals-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "signals" },
        (payload) => {
          const r = payload.new as {
            id: number;
            symbol: string;
            direction: string;
            score: number;
            reasons: RuleEvaluationLike[];
            regime: string;
            created_at: string;
          };
          setRows((prev) =>
            [
              {
                id: r.id,
                symbol: r.symbol,
                direction: r.direction,
                score: r.score,
                reasons: r.reasons ?? [],
                regime: r.regime,
                createdAt: r.created_at,
              },
              ...prev,
            ].slice(0, MAX_ROWS),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const csv = () =>
    toCsv(rows, [
      { header: "نماد", accessor: (r) => r.symbol },
      { header: "جهت", accessor: (r) => directionLabel(r.direction) },
      { header: "score", accessor: (r) => r.score },
      { header: "رژیم", accessor: (r) => r.regime },
      { header: "تاریخ", accessor: (r) => formatJalaliDateTime(r.createdAt) },
    ]);

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold">سیگنال‌های اخیر</h2>
        <ExportCsvButton getCsv={csv} filename="signals.csv" />
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">هنوز سیگنالی ثبت نشده.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="p-2 text-right">نماد</th>
                <th className="p-2 text-right">جهت</th>
                <th className="p-2 text-right">score</th>
                <th className="p-2 text-right">رژیم</th>
                <th className="p-2 text-right">تاریخ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const triggered = (row.reasons ?? []).filter((r) => r.triggered);
                const expanded = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className="cursor-pointer border-b border-border/60 hover:bg-surface-2"
                      onClick={() => setExpandedId(expanded ? null : row.id)}
                    >
                      <td className="p-2">
                        <Link
                          href={`/symbol/${encodeURIComponent(row.symbol)}`}
                          className="text-accent hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.symbol}
                        </Link>
                      </td>
                      <td className="p-2">
                        <span
                          className={`rounded px-2 py-0.5 font-bold ${
                            row.direction === "buy" ? "bg-up/20 text-up" : "bg-down/20 text-down"
                          }`}
                        >
                          {directionLabel(row.direction)}
                        </span>
                      </td>
                      <td className="ltr-nums p-2">{formatFaNumber(row.score, 0)}</td>
                      <td className="p-2 text-muted">{row.regime}</td>
                      <td className="ltr-nums p-2 text-muted">{formatJalaliDateTime(row.createdAt)}</td>
                    </tr>
                    {expanded && (
                      <tr key={`${row.id}-detail`} className="border-b border-border/60 bg-surface-2/40">
                        <td colSpan={5} className="p-2">
                          <div className="flex flex-wrap gap-1">
                            {triggered.length === 0 ? (
                              <span className="text-muted">فاکتوری trigger نشده</span>
                            ) : (
                              triggered.map((t) => (
                                <span key={t.rule} className="rounded bg-surface px-2 py-0.5">
                                  {t.rule}{" "}
                                  <span className="ltr-nums text-muted">({formatFaNumber(t.contribution, 0)})</span>
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
