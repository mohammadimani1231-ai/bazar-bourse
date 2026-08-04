import { formatJalaliDateTime } from "@/lib/jalali.ts";

export interface NewsItem {
  id: number;
  title: string;
  source: string;
  url: string;
  matchedKeywords: string[];
  publishedAt: string | null;
}

export function NewsFeed({ items }: { items: NewsItem[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <h2 className="mb-2 text-sm font-bold">اخبار مرتبط</h2>
      {items.length === 0 ? (
        <p className="text-xs text-muted">هنوز خبری با کلیدواژه‌های تعیین‌شده پیدا نشده.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="border-b border-border/60 pb-2 text-xs last:border-0">
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                {item.title}
              </a>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-muted">
                <span>{item.source}</span>
                {item.publishedAt && <span className="ltr-nums">{formatJalaliDateTime(item.publishedAt)}</span>}
                {item.matchedKeywords.map((kw) => (
                  <span key={kw} className="rounded bg-surface-2 px-1.5 py-0.5">
                    {kw}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
