import { beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const FIX = join(import.meta.dir, "..", "fixtures", "app");
const BUILD = join(ROOT, "packages", "swift-rust", "bin", "build.mjs");
const OUT = join(FIX, ".vercel", "output");
const STATIC = join(OUT, "static");
const FN = join(OUT, "functions");

const readStatic = (p: string) => readFileSync(join(STATIC, p), "utf8");
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));

const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [relative(OUT, full)];
  });

beforeAll(() => {
  const { VERCEL: _ignored, ...env } = process.env;
  const r = spawnSync("bun", [BUILD], {
    cwd: FIX,
    encoding: "utf8",
    env: { ...env, VERCEL: "1" },
  });
  if (r.status !== 0) throw new Error(`fixture build failed:\n${r.stdout}\n${r.stderr}`);
}, 90_000);

describe("VERCEL=1 selects the Vercel target (pinned output)", () => {
  test("emits exactly the Build Output API v3 file set", () => {
    const files = listFiles(OUT).sort();
    const islands = files.filter((f) => f.startsWith("static/_swift-rust/island/"));
    const fonts = files.filter((f) => f.startsWith("static/_swift-rust/fonts/"));
    const rest = files.filter((f) => !islands.includes(f) && !fonts.includes(f));
    expect(islands.length).toBe(3);
    expect(fonts.length).toBeGreaterThan(0);
    const funcs = [
      "dash",
      "docs/[[...slug]]",
      "feed/preview/[id]",
      "item/[id]",
      "photo/[id]",
      "shop",
      "static-bad",
      "widget",
    ];
    const pages = [
      "_public/index.html",
      "cached/index.html",
      "counter/index.html",
      "feed/index.html",
      "gallery/index.html",
      "index.html",
      "ppr-demo/index.html",
      "safe-html-demo/index.html",
      "scriptdemo/index.html",
      "serveraction/index.html",
      "static-ok/index.html",
      "templated/index.html",
      "usecache/index.html",
    ];
    const runtime = [
      "bun-version.mjs",
      "fn-core.mjs",
      "framework-version.mjs",
      "hmr-client.js",
      "navigator.js",
      "path-specifier.mjs",
    ];
    const expected = [
      "config.json",
      ...funcs.flatMap((f) =>
        [".vc-config.json", "index.js", "package.json"].map((n) => `functions/${f}.func/${n}`),
      ),
      "static/404.html",
      "static/robots.txt",
      "static/sitemap.xml",
      ...pages.map((p) => `static/${p}`),
      ...runtime.map((r) => `static/_swift-rust/${r}`),
    ].sort();
    expect(rest).toEqual(expected);
  });
  test("config.json routes are unchanged", () => {
    const routes = readJson(join(OUT, "config.json")).routes;
    const cache = { "Cache-Control": "public, max-age=31536000, immutable" };
    expect(routes.slice(0, 2)).toEqual([
      { src: "/_swift-rust/static/(.*)", headers: cache },
      { src: "/fonts/(.*)", headers: cache },
    ]);
    expect(routes.slice(-2)).toEqual([
      { handle: "filesystem" },
      { src: "^(.*)$", status: 404, dest: "/404.html" },
    ]);
    const fnRoutes = routes
      .slice(2, -2)
      .sort((a: { src: string }, b: { src: string }) => a.src.localeCompare(b.src));
    expect(fnRoutes).toEqual([
      { src: "^/docs(?:/(.*))?/?$", dest: "/docs/[[...slug]]?__sr_p0=$1" },
      { src: "^/feed/preview/([^/]+)/?$", dest: "/feed/preview/[id]?__sr_p0=$1" },
      { src: "^/item/([^/]+)/?$", dest: "/item/[id]?__sr_p0=$1" },
      { src: "^/photo/([^/]+)/?$", dest: "/photo/[id]?__sr_p0=$1" },
    ]);
  });
  test("vercel.json keeps bunVersion for Bun functions", () => {
    expect(readJson(join(FIX, "vercel.json")).bunVersion).toBe("1.x");
  });
  test("Bun-runtime functions target nodejs22.x with Vercel's Bun launcher config", () => {
    expect(readJson(join(FN, "photo", "[id].func", ".vc-config.json"))).toEqual({
      runtime: "nodejs22.x",
      handler: "index.js",
      launcherType: "Nodejs",
      supportsResponseStreaming: true,
    });
  });
});

describe("static rendering", () => {
  test("home page is prerendered to static HTML", () => {
    expect(existsSync(join(STATIC, "index.html"))).toBe(true);
    expect(readStatic("index.html")).toContain("data-home");
  });
  test("<Image> routes through the Vercel optimizer with bounded width", () => {
    const html = readStatic("index.html");
    expect(html).toContain("/_vercel/image?url=");
    expect(html).not.toContain("/_swift-rust/image"); // dev-only endpoint must be gone
    expect(html).toMatch(/w=(640|750|828|1080|1200|1920|2048|3840)/);
  });
  test("metadata + OpenGraph are emitted", () => {
    const html = readStatic("index.html");
    expect(html).toContain("<title>Fixture</title>");
    expect(html).toContain('property="og:image"');
    expect(html).toContain('property="og:image:width"');
  });
  test("config.json enables the image optimizer", () => {
    const cfg = readJson(join(OUT, "config.json"));
    expect(cfg.images?.sizes).toContain(3840);
  });
  test("robots.txt is emitted into static output", () => {
    const txt = readStatic("robots.txt");
    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Allow: /");
    expect(txt).toContain("Disallow: /secret/");
  });
  test("sitemap.xml is emitted into static output", () => {
    const xml = readStatic("sitemap.xml");
    expect(xml).toContain("<urlset");
    expect(xml).toContain("<loc>https://example.com</loc>");
  });
  test("static page wraps template.tsx", () => {
    const html = readStatic("templated/index.html");
    expect(html).toContain('data-templated="true"');
    expect(html).toContain("Templated Content");
  });
  test("<Script> component renders into static output", () => {
    const html = readStatic("scriptdemo/index.html");
    expect(html).toContain('id="analytics"');
    expect(html).toContain('data-strategy="afterInteractive"');
    expect(html).toContain("analytics loaded");
  });
});

describe("fonts", () => {
  test("Google fonts are isolated into independent stylesheet links", () => {
    const html = readStatic("index.html");
    expect(html).toContain("fonts.googleapis.com/css2?family=Geist&display=swap");
    expect(html).toContain("fonts.googleapis.com/css2?family=Roboto&display=swap");
    expect(html).not.toContain("family=Geist&family=Roboto");
    expect(html).not.toContain(":wght@300..900");
  });
  test("local font classes and variables are injected from the layout", () => {
    const html = readStatic("index.html");
    expect(html).toContain("data-swift-rust-local-fonts");
    expect(html).toContain(".__swift_rust_font_lausanne");
    expect(html).toContain(".__swift_rust_font_lausanne_variable");
  });
  test("bundled local fonts are emitted to the output", () => {
    expect(existsSync(join(STATIC, "_swift-rust", "fonts", "Lausanne.otf"))).toBe(true);
  });
});

describe("client runtime", () => {
  test("the navigator script is emitted and injected", () => {
    expect(existsSync(join(STATIC, "_swift-rust", "navigator.js"))).toBe(true);
    expect(readStatic("index.html")).toContain("/_swift-rust/navigator.js");
    const navigator = readStatic("_swift-rust/navigator.js");
    expect(navigator).toContain("data-sr-scroll-preserve");
    expect(navigator).toContain("data-swift-rust-google-font");
    expect(navigator).toContain("data-swift-rust-local-fonts");
  });
});

describe("function emission", () => {
  test("a 'use node' route emits a Node function with package.json", () => {
    const cfg = readJson(join(FN, "dash.func", ".vc-config.json"));
    expect(cfg.runtime).toBe("nodejs22.x");
    expect(cfg.launcherType).toBe("Nodejs");
    expect(existsSync(join(FN, "dash.func", "index.js"))).toBe(true);
    const pkg = readJson(join(FN, "dash.func", "package.json"));
    expect(pkg.type).toBe("module");
  });
  test("a [param] route emits one function + a config.json route with captured param query", () => {
    expect(existsSync(join(FN, "item", "[id].func", "index.js"))).toBe(true);
    const cfg = readJson(join(OUT, "config.json"));
    expect(cfg.routes.some((r: { dest?: string }) => r.dest === "/item/[id]?__sr_p0=$1")).toBe(
      true,
    );
    expect(cfg.routes.some((r: { src?: string }) => r.src === "^/item/([^/]+)/?$")).toBe(true);
  });
  test("optional catch-all [[...slug]] emits a function with optional segment regex and dest query", () => {
    expect(existsSync(join(FN, "docs", "[[...slug]].func", "index.js"))).toBe(true);
    const cfg = readJson(join(OUT, "config.json"));
    expect(
      cfg.routes.some((r: { dest?: string }) => r.dest === "/docs/[[...slug]]?__sr_p0=$1"),
    ).toBe(true);
    expect(cfg.routes.some((r: { src?: string }) => r.src === "^/docs(?:/(.*))?/?$")).toBe(true);
  });
  test("private folders starting with _ are not emitted as routes or functions", () => {
    expect(existsSync(join(STATIC, "_secret"))).toBe(false);
    expect(existsSync(join(FN, "_secret.func"))).toBe(false);
  });
  test("escaped %5F folders are emitted as _folder static assets", () => {
    expect(existsSync(join(STATIC, "_public", "index.html"))).toBe(true);
  });
  test("@slot dirs are not emitted as routes", () => {
    expect(existsSync(join(STATIC, "shop", "@panel"))).toBe(false);
  });
});

async function invoke(funcRel: string, path: string, init?: RequestInit) {
  const mod = await import(join(FN, funcRel, "index.js"));
  const handler = typeof mod.default === "function" ? mod.default : mod.default.fetch;
  const res: Response = await handler(new Request(`https://t.dev${path}`, init));
  return {
    status: res.status,
    location: res.headers.get("location"),
    html: res.status === 200 ? await res.text() : "",
  };
}

describe("function request pipeline", () => {
  test("guard (opt-in) redirects when access is denied", async () => {
    const r = await invoke("dash.func", "/dash");
    expect(r.status).toBe(307);
    expect(r.location).toContain("/login");
  });
  test("loader + state + seo run on a successful request", async () => {
    const r = await invoke("dash.func", "/dash?ok=1");
    expect(r.status).toBe(200);
    expect(r.html).toContain("ada"); // loaderData.user
    expect(r.html).toContain("__SR_STATE__"); // state.ts
    expect(r.html).toContain("<title>Dashboard</title>"); // seo.tsx overrides
  });
  test("[param] route extracts params from the URL and inlines .env.production + client islands", async () => {
    const r = await invoke("item/[id].func", "/item/widget-42");
    expect(r.html).toContain("widget-42");
    expect(r.html).toContain('data-api="https://prod.example.com"');
    expect(r.html).toContain('data-region="from-env-file"');
    expect(r.html).toContain("data-sr-island");
    expect(r.html).toMatch(
      /<script type="module" src="\/_swift-rust\/island\/[a-z0-9]+\.js"><\/script>/,
    );
  });
  test("[param] route recovers param when Vercel rewrites pathname to /item/[id]?__sr_p0=...", async () => {
    const r = await invoke("item/[id].func", "/item/[id]?__sr_p0=rewritten-99");
    expect(r.html).toContain("rewritten-99");
  });
  test("Nodejs (req, res) launcher bridge works on emitted function", async () => {
    const mod = await import(join(FN, "item", "[id].func", "index.js"));
    expect(typeof mod.GET).toBe("function");
    let statusCode = 0;
    const headers: Record<string, string | string[]> = {};
    let bodyBytes = new Uint8Array();
    const req = {
      method: "GET",
      url: "/item/[id]?__sr_p0=node-bridge-7",
      headers: { host: "t.dev", "x-forwarded-proto": "https" },
    };
    const res = {
      set statusCode(c: number) {
        statusCode = c;
      },
      get statusCode() {
        return statusCode;
      },
      setHeader(k: string, v: string | string[]) {
        headers[k.toLowerCase()] = v;
      },
      end(chunk?: any) {
        if (chunk) bodyBytes = chunk;
      },
    };
    await mod.default(req, res);
    expect(statusCode).toBe(200);
    const html = new TextDecoder().decode(bodyBytes);
    expect(html).toContain("node-bridge-7");
  });
  test("'use client' route is wrapped for hydration with its island bundle", async () => {
    const r = await invoke("widget.func", "/widget");
    expect(r.html).toContain("__sr_island_root");
    expect(r.html).toMatch(/_swift-rust\/island\/[a-z0-9]+\.js/);
  });
  test("parallel @slot is composed into the layout", async () => {
    const r = await invoke("shop.func", "/shop");
    expect(r.html).toContain("PANEL");
  });
  test("optional catch-all function handles base route and nested segments across Vercel rewrites", async () => {
    const base = await invoke("docs/[[...slug]].func", "/docs");
    expect(base.status).toBe(200);
    expect(base.html).toMatch(/docs-slug:(?:<!-- -->)?ROOT_DOCS/);

    const nested = await invoke("docs/[[...slug]].func", "/docs/getting-started");
    expect(nested.status).toBe(200);
    expect(nested.html).toMatch(/docs-slug:(?:<!-- -->)?getting-started/);

    const rewritten = await invoke(
      "docs/[[...slug]].func",
      "/docs/[[...slug]]?__sr_p0=deep/nested/guide",
    );
    expect(rewritten.status).toBe(200);
    expect(rewritten.html).toMatch(/docs-slug:(?:<!-- -->)?deep\/nested\/guide/);
  });
});
