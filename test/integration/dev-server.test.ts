import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const FIX = join(import.meta.dir, "..", "fixtures", "app");
const DEV = join(ROOT, "packages", "swift-rust", "bin", "dev-server.mjs");
const FRAMEWORK_VERSION = JSON.parse(
  readFileSync(join(ROOT, "packages", "swift-rust", "package.json"), "utf8"),
).version;
const PORT = 41987;
const BASE = `http://127.0.0.1:${PORT}`;

let proc: ChildProcess;

async function waitReady(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/`, { redirect: "manual" });
      if (r.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("dev server did not become ready");
}

beforeAll(async () => {
  try {
    writeFileSync(
      join(FIX, "src", "components", "widget.tsx"),
      "export function Widget() {\n  return <span data-widget>VERSION1</span>;\n}\n",
    );
  } catch {}
  proc = spawn(process.execPath, [DEV, "--port", String(PORT), "--hostname", "127.0.0.1"], {
    cwd: FIX,
    stdio: "ignore",
    env: process.env,
  });
  await waitReady();
}, 30_000);

afterAll(() => {
  proc?.kill("SIGTERM");
});

const get = (path: string) => fetch(`${BASE}${path}`, { redirect: "manual" });

describe("dev server route pipeline", () => {
  test("health reports the installed framework version", async () => {
    const response = await get("/_swift-rust/health");
    expect(response.status).toBe(200);
    expect(((await response.json()) as any).version).toBe(FRAMEWORK_VERSION);
  });

  test("default route resolves to the bun runtime", async () => {
    const r = await get("/");
    expect(r.status).toBe(200);
    expect(r.headers.get("x-swift-rust-runtime")).toBe("bun");
    expect(r.headers.get("x-swift-rust-dynamic")).toBeNull();
  });

  test("'use node' route reports node runtime + dynamic", async () => {
    const r = await get("/dash?ok=1");
    expect(r.status).toBe(200);
    expect(r.headers.get("x-swift-rust-runtime")).toBe("node");
    expect(r.headers.get("x-swift-rust-dynamic")).toBe("1");
  });

  test("opt-in guard ('use guard') redirects when denied", async () => {
    const r = await get("/dash");
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toContain("/login");
  });

  test("loader data is rendered into the page", async () => {
    const html = await (await get("/dash?ok=1")).text();
    expect(html).toContain("ada");
  });

  test("[param] route resolves and renders the param", async () => {
    const html = await (await get("/item/abc-123")).text();
    expect(html).toContain("abc-123");
  });

  test("private folders starting with _ are excluded from routing", async () => {
    const res = await get("/_secret");
    expect(res.status).toBe(404);
  });

  test("folders prefixed with %5F map to URL segments starting with underscore", async () => {
    const res = await get("/_public");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("escaped underscore content");
  });

  test("optional catch-all [[...slug]] matches base route with undefined param", async () => {
    const res = await get("/docs");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/docs-slug:(?:<!-- -->)?ROOT_DOCS/);
  });

  test("optional catch-all [[...slug]] matches one or more segments", async () => {
    const res = await get("/docs/intro/getting-started");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/docs-slug:(?:<!-- -->)?intro\/getting-started/);
  });

  test("intercepting route inside parallel slot renders on soft navigation", async () => {
    const softRes = await fetch(`${BASE}/photo/42`, {
      headers: { "x-swift-rust-nav": "1", "x-swift-rust-from": "/gallery" },
    });
    expect(softRes.status).toBe(200);
    const softHtml = await softRes.text();
    expect(softHtml).toContain("data-photo-modal");
    expect(softHtml).toMatch(/photo-modal:(?:<!-- -->)?42/);
    expect(softHtml).toContain("gallery-feed-content");
  });

  test("hard navigation directly to an intercepted target route renders the main page", async () => {
    const hardRes = await get("/photo/42");
    expect(hardRes.status).toBe(200);
    const hardHtml = await hardRes.text();
    expect(hardHtml).toContain("data-photo-page");
    expect(hardHtml).toMatch(/full-photo-page:(?:<!-- -->)?42/);
    expect(hardHtml).not.toContain("data-photo-modal");
  });

  test("standalone intercepting route (.) intercepts same-level route on soft navigation", async () => {
    const hardRes = await get("/feed/preview/7");
    expect(hardRes.status).toBe(200);
    expect(await hardRes.text()).toMatch(/direct-preview:(?:<!-- -->)?7/);

    const softRes = await fetch(`${BASE}/feed/preview/7`, {
      headers: { "x-swift-rust-nav": "1", "x-swift-rust-from": "/feed" },
    });
    expect(softRes.status).toBe(200);
    expect(await softRes.text()).toMatch(/intercepted-preview:(?:<!-- -->)?7/);
  });

  test("the navigator runtime is served", async () => {
    const r = await get("/_swift-rust/navigator.js");
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("__SR_NAV__");
  });

  test("local font assets are served from root and nested directories", async () => {
    const lausanne = await get("/_swift-rust/fonts/Lausanne.otf");
    expect(lausanne.status).toBe(200);
    expect(lausanne.headers.get("content-type")).toBe("font/otf");

    const varent = await get("/_swift-rust/fonts/varent-font-family/VarentGrotesk-Bold.otf");
    expect(varent.status).toBe(200);
    expect(varent.headers.get("content-type")).toBe("font/otf");
  });

  // Regression guard for the stale-until-restart bug: editing a file under
  // src/components/ (imported transitively by a page) must re-render on the
  // next request without restarting the server.
  test("HMR: editing a src/components file re-renders without a restart", async () => {
    const widget = join(FIX, "src", "components", "widget.tsx");
    const original = readFileSync(widget, "utf8");
    try {
      expect(await (await get("/")).text()).toContain("VERSION1");
      writeFileSync(widget, original.replace("VERSION1", "HMR_RELOADED"));
      let after = "";
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 150));
        after = await (await get("/")).text();
        if (after.includes("HMR_RELOADED")) break;
      }
      expect(after).toContain("HMR_RELOADED");
    } finally {
      writeFileSync(widget, original);
    }
  });

  // Regression guard for the browser-never-reloads bug: the server emits the
  // HMR signal as an *unnamed* SSE message (`data: {...}` with no `event:` line),
  // which fires the browser's default "message" event. The hmr-client therefore
  // MUST listen on "message" and unwrap the {event,data} envelope — listening
  // only on "change" silently dropped every reload. We assert both halves here.
  test("HMR: SSE emits an unwrappable reload payload + client listens on 'message'", async () => {
    const hmrClient = readFileSync(
      join(ROOT, "packages", "swift-rust", "bin", "runtime", "hmr-client.js"),
      "utf8",
    );
    expect(hmrClient).toContain('addEventListener("message"');

    const widget = join(FIX, "src", "components", "widget.tsx");
    const original = readFileSync(widget, "utf8");
    await new Promise((r) => setTimeout(r, 400));
    const abortCtrl = new AbortController();
    const res = await fetch(`${BASE}/_swift-rust/hmr`, { signal: abortCtrl.signal });
    if (!res.body) throw new Error("HMR response did not include a body");
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    const events: string[] = [];
    void (async () => {
      let buf = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i = buf.indexOf("\n\n");
          while (i !== -1) {
            const frame = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
            if (dataLine) {
              const msg = JSON.parse(dataLine.slice(5).trim());
              const data = msg?.event && msg.data ? msg.data : msg;
              if (data?.type) events.push(data.type);
            }
            i = buf.indexOf("\n\n");
          }
        }
      } catch {}
    })();
    const waitFor = async (type: string, ms: number) => {
      const by = Date.now() + ms;
      while (Date.now() < by && !events.includes(type)) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return events.includes(type);
    };
    try {
      writeFileSync(widget, original.replace("VERSION1", "SSE_RELOAD"));
      expect(await waitFor("reload", 6000)).toBe(true);
    } finally {
      abortCtrl.abort();
      await reader.cancel().catch(() => {});
      writeFileSync(widget, original);
      await new Promise((r) => setTimeout(r, 400));
    }
  }, 12_000);

  // A 'use server' component imported into a 'use client' page used to silently
  // do nothing (the directive was ignored, the component never ran server-side,
  // no error). It must now fail loudly with actionable guidance, because this
  // SSR + islands model has no React Server Components / Flight to run it.
  test("'use server' component inside a 'use client' page fails loudly", async () => {
    const fs = await import("node:fs");
    const dir = join(FIX, "src", "app", "badclient");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      join(dir, "thing.tsx"),
      "'use server'\nexport function Thing(){ return <span data-thing>t</span>; }\n",
    );
    fs.writeFileSync(
      join(dir, "page.tsx"),
      "'use client'\nimport { Thing } from \"./thing\";\nexport default function Page(){ return <Thing/>; }\n",
    );
    try {
      let res!: Response;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 150));
        res = await get("/badclient");
        if (res.status >= 500) break;
      }
      expect(res.status).toBeGreaterThanOrEqual(500);
      const body = await res.text();
      expect(body).toContain("use server");
      expect(body).toContain("use client");
      expect(body).toContain(`Swift Rust v${FRAMEWORK_VERSION} · dev mode`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 12_000);

  // Component-level "use client" islands: a 'use client' component imported into
  // a server page must SSR inside a hydration marker (with serialized props) and
  // get a self-mounting browser bundle, so it becomes interactive on the client.
  test("a 'use client' component in a server page becomes a hydrated island", async () => {
    const html = await (await get("/counter")).text();
    // SSR'd inside a marker, with the server-passed props serialized.
    expect(html).toContain("data-sr-island");
    expect(html).toMatch(/data-sr-island-src="[^"]*counter\.tsx"/);
    expect(html).toContain('data-sr-island-export="Counter"');
    expect(html).toContain("&quot;start&quot;:5");
    expect(html).toContain("&quot;label&quot;:&quot;hits&quot;");
    // A per-component island script is injected.
    const m = html.match(/\/_swift-rust\/island-comp\.js\?p=([^"]+)/);
    if (!m) throw new Error("component island script was not injected");
    // The bundle is self-mounting and contains the real component logic.
    const bundle = await (await get(`/_swift-rust/island-comp.js?p=${m[1]}`)).text();
    expect(bundle).toContain("hydrateRoot");
    expect(bundle).toContain("useState");
    expect(bundle).toContain("data-sr-island-src");
  });

  // 'use static' marks a route as a hard-static guarantee: it renders, tags
  // itself static, and gets a long-lived revalidatable CDN cache (no dynamic).
  test("'use static' route renders static with an aggressive cache header", async () => {
    const r = await get("/static-ok");
    expect(r.status).toBe(200);
    expect(r.headers.get("x-swift-rust-render")).toBe("static");
    expect(r.headers.get("x-swift-rust-dynamic")).toBeNull();
    expect(r.headers.get("cache-control")).toContain("s-maxage=31536000");
  });

  // 'use static' + a dynamic signal (here a 'use node' runtime directive) must
  // fail loudly rather than silently shipping a wrong cache contract.
  test("'use static' conflicting with a dynamic runtime fails loudly", async () => {
    const r = await get("/static-bad");
    expect(r.status).toBeGreaterThanOrEqual(500);
    const body = await r.text();
    expect(body).toContain("use static");
    expect(body).toContain("use node");
  });

  // Earlier tests write fixture files; the watcher's debounced flush can land a
  // few hundred ms later, rebuilding modules (which legitimately resets their
  // module-level counters). Wait it out before asserting on counter state.
  const settleWatcher = () => new Promise((r) => setTimeout(r, 500));

  // cache() memoizes loader data across requests; the on-demand revalidate
  // endpoint purges by tag so the next request recomputes.
  test("cache() + revalidateTag invalidates loader data on demand", async () => {
    const strip = (s: string) => s.replace(/<!--[^>]*-->/g, "");
    const read = async () => {
      const m = strip(await (await get("/cached")).text()).match(/data-cached[^>]*>n=(\d+)/);
      return m ? Number(m[1]) : NaN;
    };
    await settleWatcher();
    const a = await read();
    const b = await read();
    expect(a).toBe(b); // cached → identical

    const res = await fetch(`${BASE}/_swift-rust/revalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: "counter" }),
    });
    const json = (await res.json()) as { revalidated: boolean; purged: number };
    expect(json.revalidated).toBe(true);
    expect(json.purged).toBeGreaterThanOrEqual(1);

    const c = await read();
    expect(c).toBeGreaterThan(a); // recomputed after purge
  });

  test("revalidate endpoint rejects non-POST", async () => {
    const r = await get("/_swift-rust/revalidate");
    expect(r.status).toBe(405);
  });

  // The 'use cache' directive auto-memoizes a module's async exports (tagged by
  // file path), so a loader calling them is cached until revalidated.
  test("'use cache' directive memoizes async exports until revalidated", async () => {
    const strip = (s: string) => s.replace(/<!--[^>]*-->/g, "");
    const read = async () => {
      const m = strip(await (await get("/usecache")).text()).match(/data-uc[^>]*>n=(\d+)/);
      return m ? Number(m[1]) : NaN;
    };
    await settleWatcher();
    const a = await read();
    expect(await read()).toBe(a); // memoized by the directive
    await fetch(`${BASE}/_swift-rust/revalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: "src/app/usecache/data.ts" }),
    });
    expect(await read()).toBeGreaterThan(a); // file-path tag purged it
  });

  // Regression guard for the save-shows-an-error-until-reload bug: SSR builds
  // shared one global temp-file list, so concurrent renders (every open tab
  // reloads at once on an HMR broadcast) deleted each other's island temp files
  // mid-build → transient module-not-found 500s. Per-build temp lists + in-flight
  // dedup must keep a burst of parallel requests clean right after an edit.
  test("HMR: concurrent requests right after an edit all succeed", async () => {
    const widget = join(FIX, "src", "components", "widget.tsx");
    const original = readFileSync(widget, "utf8");
    try {
      for (let round = 0; round < 3; round++) {
        writeFileSync(widget, original.replace("VERSION1", `BURST_${round}`));
        await new Promise((r) => setTimeout(r, 120)); // land inside the rebuild window
        const results = await Promise.all(
          // /counter renders a 'use client' island (exercises the temp files);
          // / imports the edited widget.
          ["/", "/counter", "/", "/counter", "/", "/counter"].map((p) => get(p)),
        );
        for (const r of results) expect(r.status).toBe(200);
      }
    } finally {
      writeFileSync(widget, original);
      await new Promise((r) => setTimeout(r, 400));
    }
  }, 20_000);

  // Regression guard for reload-into-a-dead-error-page: a syntax-broken save
  // must broadcast {type:"error"} (overlay on the live page, no reload), and the
  // next clean save must broadcast a reload again.
  test("HMR: a syntax error broadcasts an error event, then recovers on fix", async () => {
    const widget = join(FIX, "src", "components", "widget.tsx");
    const original = readFileSync(widget, "utf8");
    const abortCtrl = new AbortController();
    const res = await fetch(`${BASE}/_swift-rust/hmr`, { signal: abortCtrl.signal });
    if (!res.body) throw new Error("HMR response did not include a body");
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    const events: string[] = [];
    // Background pump: a single continuous reader (racing fresh read() calls
    // against timeouts drops chunks).
    void (async () => {
      let buf = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i = buf.indexOf("\n\n");
          while (i !== -1) {
            const frame = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
            if (dataLine) {
              const msg = JSON.parse(dataLine.slice(5).trim());
              const data = msg?.event && msg.data ? msg.data : msg;
              if (data.type) events.push(data.type);
            }
            i = buf.indexOf("\n\n");
          }
        }
      } catch {}
    })();
    const waitFor = async (type: string, ms: number) => {
      const by = Date.now() + ms;
      while (Date.now() < by && !events.includes(type)) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return events.includes(type);
    };
    try {
      writeFileSync(widget, "export function Widget() { return <div>broken\n"); // unterminated
      expect(await waitFor("error", 6000)).toBe(true);
      expect(events).not.toContain("reload");

      events.length = 0;
      writeFileSync(widget, original);
      expect(await waitFor("reload", 6000)).toBe(true);
    } finally {
      abortCtrl.abort();
      await reader.cancel().catch(() => {});
      writeFileSync(widget, original);
      await new Promise((r) => setTimeout(r, 400));
    }
  }, 20_000);

  test("template.tsx wraps the page content", async () => {
    const res = await get("/templated");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-templated="true"');
    expect(html).toContain("Templated Content");
  });

  test("default.tsx serves as fallback for unmatched parallel route slots", async () => {
    const res = await get("/gallery");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-modal-default="true"');
  });

  test("/robots.txt is generated dynamically from app/robots.ts", async () => {
    const res = await get("/robots.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const txt = await res.text();
    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Allow: /");
    expect(txt).toContain("Disallow: /secret/");
    expect(txt).toContain("Sitemap: https://example.com/sitemap.xml");
  });

  test("/sitemap.xml is generated dynamically from app/sitemap.ts", async () => {
    const res = await get("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");
    const xml = await res.text();
    expect(xml).toContain("<urlset");
    expect(xml).toContain("<loc>https://example.com</loc>");
    expect(xml).toContain("<loc>https://example.com/about</loc>");
    expect(xml).toContain("<priority>1.0</priority>");
  });

  test("instrumentation.ts register() runs on server startup", async () => {
    const res = await get("/api/instrumentation");
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.registered).toBe(true);
  });

  test("<Script> component renders with strategy and attributes", async () => {
    const res = await get("/scriptdemo");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="analytics"');
    expect(html).toContain('data-strategy="afterInteractive"');
    expect(html).toContain("analytics loaded");
  });

  test("<Form action={serverAction}> renders with action id hidden input", async () => {
    const res = await get("/serveraction");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('action="/_swift-rust/action"');
    expect(html).toContain('name="__sr_action_id"');
    expect(html).toContain('value="src/app/actions.ts#addItem"');
  });

  test("Server Action executes via POST with FormData", async () => {
    const fd = new FormData();
    fd.append("__sr_action_id", "src/app/actions.ts#addItem");
    fd.append("name", "swift-item-99");
    const res = await fetch(`${BASE}/_swift-rust/action`, {
      method: "POST",
      body: fd,
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.ok).toBe(true);
    expect(json.data.success).toBe(true);
    expect(json.data.item).toBe("swift-item-99");
  });

  test("Server Action executes via POST with JSON RPC arguments", async () => {
    const res = await fetch(`${BASE}/_swift-rust/action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-action-id": "src/app/actions.ts#rpcMultiply",
      },
      body: JSON.stringify([6, 7]),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.ok).toBe(true);
    expect(json.data.result).toBe(42);
  });

  test("Partial Prerendering (PPR) responds with hybrid streaming headers and shell", async () => {
    const res = await get("/ppr-demo");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-swift-rust-render")).toBe("ppr");
    expect(res.headers.get("x-swift-rust-ppr")).toBe("1");
    const html = await res.text();
    expect(html).toContain("Partial Prerendering Shell");
    expect(html).toContain("Streamed Hybrid Content");
  });

  test("<SafeHtml> renders cryptographically signed HTML and blocks unauthenticated raw strings", async () => {
    const res = await get("/safe-html-demo");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-swift-rust-safe="verified"');
    expect(html).toContain('<section id="trusted-zone"><h2>Verified Codebase HTML</h2></section>');
    expect(html).toContain('data-swift-rust-safe="blocked"');
    expect(html).not.toContain("<script>alert('xss-attempt')</script>");
    expect(html).toContain("&lt;script&gt;alert(&#x27;xss-attempt&#x27;)&lt;/script&gt;");
  });
});
