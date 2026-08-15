/**
 * سر هر ساعت که چند کرون هم‌زمان شلیک می‌کنند، PostgREST گاهی خطای گذرای
 * `PGRST303 JWT issued at future` (اسکیوی ساعت زیر بار، سمت زیرساخت Supabase) می‌دهد —
 * مستند در CLAUDE.md. یک بار retry بعد از تأخیر کوتاه معمولاً کافی است چون خودِ اسکیو گذراست.
 * قبلاً فقط داخل evaluate-alerts بود؛ چون collect-global هم دقیقاً همین خطا را می‌گیرد،
 * مشترک شد تا هر مصرف‌کنندهٔ بعدی هم از همین استفاده کند (بدون پیاده‌سازی موازی).
 */
export async function withJwtSkewRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const code = err && typeof err === "object" ? (err as { code?: string }).code : undefined;
    if (code !== "PGRST303") throw err;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return await fn();
  }
}
