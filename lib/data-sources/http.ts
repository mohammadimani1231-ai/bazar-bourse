export interface FetchWithRetryOptions {
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
}

/**
 * fetch با timeout و retry ساده (backoff خطی). پیاده‌سازی خالص و بدون وابستگی
 * به Deno یا Node — قابل استفاده هم در Edge Function و هم در اسکریپت Node.js،
 * چون هر دو fetch/AbortController سراسری دارند.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  { timeoutMs = 8000, retries = 1, backoffMs = 500 }: FetchWithRetryOptions = {},
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * یک منبع را صدا می‌زند و همیشه یک SourcePingResult برمی‌گرداند —
 * حتی وقتی fetch خطا بدهد — تا خطای یک منبع بقیه را متوقف نکند.
 */
export async function pingSource(
  source: string,
  run: () => Promise<unknown>,
): Promise<import("./types.ts").SourcePingResult> {
  const start = performance.now();
  try {
    const sample = await run();
    return { source, ok: true, latencyMs: Math.round(performance.now() - start), sample };
  } catch (err) {
    return {
      source,
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
