import { Script } from "swift-rust";
import { siteConfig } from "@/lib/site.config";

/**
 * The swift-rust version, rendered with the version known at build time and
 * replaced in the browser by the latest version on npm (see LiveVersionScript).
 */
export function Version({ part = "full" }: { part?: "full" | "line" }) {
  return (
    <span data-swift-rust-version={part}>
      {part === "line" ? siteConfig.releaseLine : siteConfig.version}
    </span>
  );
}

const LIVE_VERSION_SCRIPT = `(function () {
  if (window.__srLiveVersion) return window.__srLiveVersion.apply();
  var latest = null;
  function apply() {
    if (!latest) return;
    var line = latest.split(".").slice(0, 2).join(".");
    var nodes = document.querySelectorAll("[data-swift-rust-version]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = nodes[i].getAttribute("data-swift-rust-version") === "line" ? line : latest;
    }
  }
  window.__srLiveVersion = { apply: apply };
  window.addEventListener("sr:navigate-end", apply);
  fetch("https://registry.npmjs.org/swift-rust/latest", { headers: { accept: "application/json" } })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      if (data && /^\\d+\\.\\d+\\.\\d+/.test(data.version || "")) {
        latest = data.version;
        apply();
      }
    })
    .catch(function () {});
})();`;

/** Updates every <Version> on the page to the latest swift-rust published to npm. */
export function LiveVersionScript() {
  return (
    <Script id="swift-rust-live-version" strategy="afterInteractive">
      {LIVE_VERSION_SCRIPT}
    </Script>
  );
}
