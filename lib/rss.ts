export interface RssItem {
  title: string;
  link: string;
  pubDate: string | null;
  guid: string | null;
}

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => ENTITY_MAP[name]);
}

function stripCdata(text: string): string {
  const m = text.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return (m ? m[1] : text).trim();
}

function extractTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return null;
  return decodeEntities(stripCdata(m[1]));
}

/** پارس ساده و بی‌وابستگی RSS 2.0 — کافی برای فیدهای خبری استاندارد، نه یک XML parser کامل. */
export function parseRssItems(xml: string): RssItem[] {
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const items: RssItem[] = [];

  for (const block of itemBlocks) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    if (!title || !link) continue;

    items.push({
      title,
      link,
      pubDate: extractTag(block, "pubDate"),
      guid: extractTag(block, "guid"),
    });
  }

  return items;
}
