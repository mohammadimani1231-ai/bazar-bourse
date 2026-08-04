import { createServiceClient } from "../_shared/supabaseClient.ts";
import { logHealth } from "../_shared/health.ts";
import { parseRssItems } from "../../../lib/rss.ts";
import { matchKeywords } from "../../../lib/newsKeywords.ts";

interface FeedConfig {
  url: string;
  source: string;
}

function parsePubDate(pubDate: string | null, fallbackIso: string): string {
  if (!pubDate) return fallbackIso;
  const ms = Date.parse(pubDate);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : fallbackIso;
}

/**
 * ساعتی: چند فید RSS (فارسی/بین‌المللی، لیستش در settings.news_feeds — configurable، نه
 * هاردکد) را می‌گیرد، عنوان‌ها را با settings.news_keywords فیلتر می‌کند، فقط آیتم‌های
 * trigger‌شده را در news_items ذخیره می‌کند (dedupe روی url). خطای یک فید بقیه را متوقف نمی‌کند.
 */
Deno.serve(async () => {
  const start = performance.now();
  const client = createServiceClient();
  const capturedAt = new Date().toISOString();

  try {
    const [{ data: feedsSetting }, { data: keywordsSetting }] = await Promise.all([
      client.from("settings").select("value").eq("key", "news_feeds").maybeSingle(),
      client.from("settings").select("value").eq("key", "news_keywords").maybeSingle(),
    ]);

    const feeds = (feedsSetting?.value as FeedConfig[] | undefined) ?? [];
    const keywords = (keywordsSetting?.value as string[] | undefined) ?? [];

    const errors: string[] = [];
    const rowsToInsert: {
      title: string;
      source: string;
      url: string;
      matched_keywords: string[];
      published_at: string;
    }[] = [];

    const results = await Promise.allSettled(
      feeds.map(async (feed) => {
        const res = await fetch(feed.url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; BazarBourseBot/1.0)" },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const items = parseRssItems(xml);

        for (const item of items) {
          const matched = matchKeywords(item.title, keywords);
          if (matched.length === 0) continue;
          rowsToInsert.push({
            title: item.title,
            source: feed.source,
            url: item.link,
            matched_keywords: matched,
            published_at: parsePubDate(item.pubDate, capturedAt),
          });
        }
      }),
    );

    results.forEach((result, i) => {
      if (result.status === "rejected") {
        errors.push(`${feeds[i]?.source ?? feeds[i]?.url}: ${result.reason}`);
      }
    });

    let insertedCount = 0;
    if (rowsToInsert.length > 0) {
      const { data, error } = await client
        .from("news_items")
        .upsert(rowsToInsert, { onConflict: "url", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      insertedCount = data?.length ?? 0;
    }

    const latencyMs = Math.round(performance.now() - start);
    const status = errors.length === 0 ? "ok" : rowsToInsert.length > 0 ? "ok" : "error";
    await logHealth(
      client,
      "collect-news",
      status,
      `${insertedCount} new / ${rowsToInsert.length} matched` + (errors.length > 0 ? `; errors: ${errors.join("; ")}` : ""),
      latencyMs,
    );

    return new Response(JSON.stringify({ ok: true, insertedCount, matched: rowsToInsert.length, errors }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    await logHealth(client, "collect-news", "error", message, latencyMs);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
