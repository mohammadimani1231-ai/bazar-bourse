/**
 * PostgREST سقف پیش‌فرض ۱۰۰۰ ردیف دارد و `.limit()` بزرگ‌تر را **ساکت** نادیده می‌گیرد —
 * این کلاس باگ تا امروز دو بار در پروژه اتفاق افتاده (فاز ۳ و فاز ۴). هر کوئری‌ای که
 * ممکن است بیش از ۱۰۰۰ ردیف برگرداند باید از این helper رد شود، نه `.limit()` بزرگ.
 */
const PAGE_SIZE = 1000;

export async function fetchAllPages<T>(fetchPage: (from: number, to: number) => Promise<T[]>): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const page = await fetchPage(from, from + PAGE_SIZE - 1);
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}
