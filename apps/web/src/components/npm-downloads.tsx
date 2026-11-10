import { Script } from "swift-rust";
import { type NpmDownloadStats, npmDownloadStats } from "@/lib/npm-downloads";

const PACKAGE = "swift-rust";

function count(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Refreshes the hero counter in the browser from `/api/downloads`.
 *
 * The numbers above are baked in at build time, so a page that was prerendered
 * weeks ago would otherwise advertise a frozen total forever. The route is
 * CDN-cached (`s-maxage`), so this costs one cheap JSON request per visit, and
 * the markup degrades to the build-time numbers (or to nothing new to show) if
 * the request fails.
 */
const LIVE_DOWNLOADS_SCRIPT = `(function () {
  var ENDPOINT = "/api/downloads";
  var TTL = 5 * 60 * 1000;
  var last = null;
  var pending = false;

  function fmt(n) {
    try { return Number(n).toLocaleString("en-US"); } catch (e) { return String(n); }
  }

  function paint(stats) {
    var nodes = document.querySelectorAll("[data-npm-downloads]");
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute("data-npm-downloads");
      if (typeof stats[key] === "number") nodes[i].textContent = fmt(stats[key]);
    }
    var roots = document.querySelectorAll("[data-npm-downloads-root]");
    for (var j = 0; j < roots.length; j++) roots[j].removeAttribute("hidden");
    last = { at: Date.now(), stats: stats };
  }

  function valid(stats) {
    return !!stats && typeof stats.total === "number" && typeof stats.week === "number";
  }

  function load() {
    if (pending) return;
    if (!document.querySelector("[data-npm-downloads]")) return;
    if (last && Date.now() - last.at < TTL) return paint(last.stats);
    pending = true;
    fetch(ENDPOINT, { headers: { accept: "application/json" } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) { if (valid(data)) paint(data); })
      .catch(function () {})
      .then(function () { pending = false; });
  }

  window.addEventListener("sr:navigate-end", load);
  load();
})();`;

/**
 * Hero npm download counter.
 *
 * Rendered on the server with the numbers known at build time (so they are part
 * of the static HTML and need no JavaScript), then corrected in the browser by
 * LiveDownloadsScript.
 */
export async function NpmDownloads() {
  let stats: NpmDownloadStats | null = null;
  try {
    stats = await npmDownloadStats(PACKAGE);
  } catch {
    stats = null;
  }

  return (
    <>
      <a
        href="https://www.npmjs.com/package/swift-rust"
        target="_blank"
        rel="noreferrer"
        data-npm-downloads-root
        hidden={stats ? undefined : true}
        className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[0.8125rem] text-fg-muted hover:text-fg"
      >
        <span>
          <span data-npm-downloads="total" className="font-semibold text-fg">
            {stats ? count(stats.total) : "—"}
          </span>{" "}
          total downloads
        </span>
        <span className="text-fg-subtle" aria-hidden>
          ·
        </span>
        <span>
          <span data-npm-downloads="week" className="font-semibold text-fg">
            {stats ? count(stats.week) : "—"}
          </span>{" "}
          this week
        </span>
      </a>
      <Script id="swift-rust-live-downloads" strategy="afterInteractive">
        {LIVE_DOWNLOADS_SCRIPT}
      </Script>
    </>
  );
}
