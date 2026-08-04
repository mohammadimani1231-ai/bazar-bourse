import { describe, expect, it } from "vitest";
import { parseRssItems } from "./rss.ts";

// نمونهٔ واقعی از https://donya-e-eqtesad.com/rss (گرفته‌شده و کوتاه‌شده، نه ساختگی)
const REAL_FEED_SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<rss xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
  <channel>
    <title><![CDATA[روزنامه دنیای اقتصاد]]></title>
    <link>https://donya-e-eqtesad.com</link>
    <item>
      <title><![CDATA[جزئیاتی از  طرح عرضه رایگان سی‌ان‌جی در جایگاه‌ها]]></title>
      <link>https://donya-e-eqtesad.com/4286518-item-one</link>
      <guid isPermaLink="false">https://donya-e-eqtesad.com/بخش/4286518-item-one</guid>
      <description><![CDATA[<img src="https://cdn.example.com/x.jpg"> <div>توضیحات نادیده گرفته می‌شود</div>]]></description>
      <pubDate>Tue, 04 Aug 2026 12:58:56 +0000</pubDate>
    </item>
    <item>
      <title><![CDATA[طرح ضد روسی واشنگتن با کمک گرفتن از دمشق/ سوریه درخواست آمریکا را پذیرفت]]></title>
      <link>https://donya-e-eqtesad.com/4286517-item-two</link>
      <guid isPermaLink="false">https://donya-e-eqtesad.com/بخش/4286517-item-two</guid>
      <description><![CDATA[توضیح دوم]]></description>
      <pubDate>Tue, 04 Aug 2026 12:45:10 +0000</pubDate>
    </item>
  </channel>
</rss>`;

describe("parseRssItems", () => {
  it("همهٔ آیتم‌های یک فید واقعی را استخراج می‌کند", () => {
    const items = parseRssItems(REAL_FEED_SAMPLE);
    expect(items).toHaveLength(2);
  });

  it("عنوان را از CDATA بیرون می‌کشد و trim می‌کند", () => {
    const items = parseRssItems(REAL_FEED_SAMPLE);
    expect(items[0].title).toBe("جزئیاتی از  طرح عرضه رایگان سی‌ان‌جی در جایگاه‌ها");
  });

  it("link و pubDate و guid درست خوانده می‌شوند", () => {
    const items = parseRssItems(REAL_FEED_SAMPLE);
    expect(items[1].link).toBe("https://donya-e-eqtesad.com/4286517-item-two");
    expect(items[1].pubDate).toBe("Tue, 04 Aug 2026 12:45:10 +0000");
    expect(items[1].guid).toBe("https://donya-e-eqtesad.com/بخش/4286517-item-two");
  });

  it("آیتم بدون title یا link نادیده گرفته می‌شود", () => {
    const xml = `<rss><channel><item><description>بدون عنوان</description></item></channel></rss>`;
    expect(parseRssItems(xml)).toHaveLength(0);
  });

  it("entityهای HTML رمزگشایی می‌شوند", () => {
    const xml = `<rss><channel><item><title>A &amp; B &lt;test&gt;</title><link>https://x.test/&amp;q=1</link></item></channel></rss>`;
    const items = parseRssItems(xml);
    expect(items[0].title).toBe("A & B <test>");
    expect(items[0].link).toBe("https://x.test/&q=1");
  });

  it("فید خالی آرایهٔ خالی می‌دهد", () => {
    expect(parseRssItems("<rss><channel></channel></rss>")).toEqual([]);
  });
});
