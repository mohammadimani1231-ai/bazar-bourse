import { pingSource } from "../../../lib/data-sources/http.ts";
import { fetchYahooQuote } from "../../../lib/data-sources/yahoo.ts";
import { fetchBrsApiSymbol } from "../../../lib/data-sources/brsapi.ts";

Deno.serve(async () => {
  const brsApiKey = Deno.env.get("BRSAPI_KEY") ?? "";

  const results = await Promise.all([
    pingSource("brsapi", () => fetchBrsApiSymbol("خودرو", brsApiKey)),
    pingSource("yahoo", () => fetchYahooQuote("BZ=F")),
  ]);

  const ok = results.every((r) => r.ok);

  return new Response(JSON.stringify({ ok, results }, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
