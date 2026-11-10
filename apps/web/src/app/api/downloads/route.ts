import { npmDownloadStats } from "@/lib/npm-downloads";

const PACKAGE = "swift-rust";

/**
 * Live npm download counts for the hero counter.
 *
 * Served from the serverless function but cached at the CDN: every visitor gets
 * a number that is at most ~15 minutes old without hammering the npm registry,
 * and the marketing page itself can stay fully static.
 */
export async function GET() {
  const stats = await npmDownloadStats(PACKAGE);

  if (!stats) {
    return new Response(JSON.stringify({ error: "npm download stats unavailable" }), {
      status: 503,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=0, s-maxage=30, stale-while-revalidate=300",
      },
    });
  }

  const cacheable = "public, s-maxage=900, stale-while-revalidate=86400";

  return new Response(JSON.stringify(stats), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `max-age=0, ${cacheable}`,
      "cdn-cache-control": cacheable,
      "x-robots-tag": "noindex",
    },
  });
}
