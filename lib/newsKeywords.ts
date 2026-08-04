/** کلیدواژه‌هایی از لیست که در متن (عنوان خبر) پیدا می‌شوند — انگلیسی case-insensitive، فارسی عیناً */
export function matchKeywords(text: string, keywords: string[]): string[] {
  const lowerText = text.toLowerCase();
  return keywords.filter((kw) => lowerText.includes(kw.toLowerCase()));
}
