import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Subprocess, spawn, spawnSync } from "bun";
import { resolveApiTree, resolveLeafTree } from "../../packages/swift-rust/bin/server-core.mjs";
import {
  buildMultivrsManifest,
  resolveBuildTarget,
  routeSrc,
  validateMultivrsManifest,
} from "../../packages/swift-rust/bin/targets.mjs";
import { ENDPOINT_CASES, expectIsolatedRouteContext, runEndpointCase } from "./endpoint-contract";

const ROOT = join(import.meta.dir, "..", "..");
const FIX = join(import.meta.dir, "..", "fixtures", "app");
const BUILD = join(ROOT, "packages", "swift-rust", "bin", "build.mjs");
const DIST = join(FIX, "dist");
const STATIC = join(DIST, "static");

type Route = { src: string; renderMode: string; runtime?: string };
type Manifest = { framework: string; binary: string; staticDir: string; routes: Route[] };

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const envWithout = (...keys: string[]) => {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const k of keys) delete env[k];
  return env;
};
const matches = (route: Route, pathname: string) => new RegExp(`^(?:${route.src})$`).test(pathname);

describe("build target resolution", () => {
  test("defaults to multivrs", () => {
    expect(resolveBuildTarget({}).target).toBe("multivrs");
  });
  test("VERCEL=1 selects vercel", () => {
    expect(resolveBuildTarget({ env: { VERCEL: "1" } })).toEqual({
      target: "vercel",
      source: "VERCEL=1",
    });
    expect(resolveBuildTarget({ env: { VERCEL: "0" } }).target).toBe("multivrs");
  });
  test("swift-rust.config.json target pins over VERCEL=1", () => {
    expect(
      resolveBuildTarget({ env: { VERCEL: "1" }, config: { target: "multivrs" } }).target,
    ).toBe("multivrs");
    expect(resolveBuildTarget({ config: { target: "vercel" } }).target).toBe("vercel");
  });
  test("--target flag wins over config and env", () => {
    const args = { env: { VERCEL: "1" }, config: { target: "vercel" } };
    expect(resolveBuildTarget({ ...args, argv: ["--target", "multivrs"] }).target).toBe("multivrs");
    expect(resolveBuildTarget({ argv: ["--target=vercel"] }).target).toBe("vercel");
  });
  test("unknown targets are rejected", () => {
    expect(() => resolveBuildTarget({ argv: ["--target", "netlify"] })).toThrow(
      /unknown build target/,
    );
    expect(() => resolveBuildTarget({ config: { target: "nope" } })).toThrow(
      /swift-rust.config.json/,
    );
  });
  test("the CLI exits non-zero on an unknown --target", () => {
    const r = spawnSync(["bun", BUILD, "--target", "netlify"], {
      cwd: FIX,
      env: envWithout("VERCEL"),
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr.toString()).toContain("unknown build target");
  });
});

describe("route src regex", () => {
  test("matches the documented contract", () => {
    expect(routeSrc([])).toBe("/");
    expect(routeSrc(["about"])).toBe("/about/?");
    expect(routeSrc(["b", "[id]"])).toBe("/b/[^/]+/?");
    expect(routeSrc(["docs", "[...slug]"])).toBe("/docs/.+/?");
    expect(routeSrc(["docs", "[[...slug]]"])).toBe("/docs(?:/.*)?");
    expect(routeSrc(["v1.0"])).toBe("/v1\\.0/?");
  });
  test("manifest validation catches contract violations", () => {
    expect(validateMultivrsManifest(buildMultivrsManifest([]))).toEqual([]);
    const bad = {
      framework: "x",
      binary: "/abs",
      staticDir: "static",
      routes: [{ src: "/", renderMode: "wasm", runtime: "bun" }],
    };
    expect(validateMultivrsManifest(bad).length).toBeGreaterThanOrEqual(3);
    expect(validateMultivrsManifest({ ...buildMultivrsManifest([]), routes: [] })).toContain(
      "routes must be a non-empty array",
    );
  });
});

describe("endpoint resolution matches the dev server's precedence", () => {
  const dir = (children: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    ...extra,
    children: Object.entries(children).map(([name, node]) => ({ name, node })),
  });
  const api = dir({
    "[id]": dir({ edit: dir({}, { route: "id-edit" }) }, { route: "id" }),
    new: dir({}, { route: "new" }),
    "[...rest]": dir({}, { route: "rest" }),
    "%5Fprivate-ish": dir({}, { route: "escaped" }),
    opt: dir({ "[[...slug]]": dir({}, { route: "opt" }) }),
  });
  const resolve = (path: string) => resolveApiTree(api, path.split("/").filter(Boolean));
  test("literal folders win over [param]", () => {
    expect(resolve("/api/new")).toEqual({ route: "new", params: {} });
    expect(resolve("/api/7")).toEqual({ route: "id", params: { id: "7" } });
    expect(resolve("/api/7/edit")).toEqual({ route: "id-edit", params: { id: "7" } });
  });
  test("catch-all takes deeper unmatched paths", () => {
    expect(resolve("/api/7/edit/more")).toEqual({
      route: "rest",
      params: { rest: ["7", "edit", "more"] },
    });
  });
  test("optional catch-all matches its base path", () => {
    expect(resolve("/api/opt")).toEqual({ route: "opt", params: { slug: undefined } });
    expect(resolve("/api/opt/a/b")).toEqual({ route: "opt", params: { slug: ["a", "b"] } });
  });
  test("_segment maps to an escaped %5F folder", () => {
    expect(resolve("/api/_private-ish")).toEqual({ route: "escaped", params: {} });
  });
  test("non-api paths and empty trees resolve to null", () => {
    expect(resolveApiTree(api, ["blog"])).toBeNull();
    expect(resolveApiTree(null, ["api"])).toBeNull();
  });
  test("leaf resolution returns the folder node with params", () => {
    const app = dir({ calc: dir({}, { rpc: "calc-rpc" }), "[slug]": dir({}, { stream: "s" }) });
    expect(resolveLeafTree(app, ["calc"])?.node).toMatchObject({ rpc: "calc-rpc" });
    expect(resolveLeafTree(app, ["live"])).toMatchObject({
      node: { stream: "s" },
      params: { slug: "live" },
    });
  });
});

describe("multivrs build (default target)", () => {
  let vercelJsonBefore = "";
  let manifest: Manifest;

  beforeAll(() => {
    vercelJsonBefore = readFileSync(join(FIX, "vercel.json"), "utf8");
    rmSync(DIST, { recursive: true, force: true });
    const r = spawnSync(["bun", BUILD], { cwd: FIX, env: envWithout("VERCEL") });
    if (r.exitCode !== 0) throw new Error(`fixture build failed:\n${r.stdout}\n${r.stderr}`);
    manifest = readJson(join(DIST, "multivrs-build.json"));
  }, 90_000);

  test("writes manifest, server binary and static dir", () => {
    expect(existsSync(join(DIST, "multivrs-build.json"))).toBe(true);
    expect(existsSync(join(DIST, manifest.binary))).toBe(true);
    expect(existsSync(join(DIST, manifest.staticDir))).toBe(true);
  });

  test("manifest matches the Multivrs schema exactly", () => {
    expect(Object.keys(manifest).sort()).toEqual(["binary", "framework", "routes", "staticDir"]);
    expect(manifest.framework).toBe("swift-rust");
    expect(manifest.binary).toBe("server.mjs");
    expect(manifest.staticDir).toBe("static");
    expect(validateMultivrsManifest(manifest)).toEqual([]);
    for (const r of manifest.routes) {
      if (r.renderMode === "wasm") expect(Object.keys(r).sort()).toEqual(["renderMode", "src"]);
      else expect(r).toEqual({ src: r.src, renderMode: "ssr", runtime: "bun" });
    }
  });

  test("dynamic, function and prerendered routes map to the right render modes", () => {
    const find = (pathname: string) => manifest.routes.find((r) => matches(r, pathname));
    expect(find("/item/widget-42")).toEqual({
      src: "/item/[^/]+/?",
      renderMode: "ssr",
      runtime: "bun",
    });
    expect(find("/item/widget-42/")?.src).toBe("/item/[^/]+/?");
    expect(find("/docs")?.renderMode).toBe("ssr");
    expect(find("/docs/a/b")?.renderMode).toBe("ssr");
    expect(find("/dash")?.renderMode).toBe("ssr");
    expect(find("/_swift-rust/image")?.renderMode).toBe("ssr");
    expect(find("/")).toEqual({ src: "/", renderMode: "wasm" });
    expect(find("/templated")?.renderMode).toBe("wasm");
    expect(find("/item/a/b")).toBeUndefined();
    expect(find("/_secret")).toBeUndefined();
  });

  test("API routes, server actions and rpc/stream are listed as server routes", () => {
    const srcs = manifest.routes.filter((r) => r.renderMode === "ssr").map((r) => r.src);
    for (const src of [
      "/api/items/?",
      "/api/items/[^/]+/?",
      "/api/files/.+/?",
      "/api/instrumentation/?",
      "/api(?:/.*)?",
      "/_swift-rust/action/?",
      "/calc/?",
      "/events/?",
    ]) {
      expect(srcs).toContain(src);
    }
    const apiCatchAll = srcs.indexOf("/api(?:/.*)?");
    expect(srcs.indexOf("/api/items/[^/]+/?")).toBeLessThan(apiCatchAll);
  });

  test("static dir holds pages, 404, runtime, fonts and island bundles", () => {
    for (const f of [
      "index.html",
      "404.html",
      "templated/index.html",
      "robots.txt",
      "sitemap.xml",
      "_swift-rust/navigator.js",
      "_swift-rust/fonts/Lausanne.otf",
    ]) {
      expect(existsSync(join(STATIC, f))).toBe(true);
    }
    expect(existsSync(join(STATIC, "_swift-rust", "island"))).toBe(true);
  });

  test("images go through /_swift-rust/image, not /_vercel/image", () => {
    const html = readFileSync(join(STATIC, "index.html"), "utf8");
    expect(html).toContain("/_swift-rust/image?url=");
    expect(html).not.toContain("/_vercel/image");
  });

  test("does not write or modify vercel.json, and writes no Vercel output into dist", () => {
    expect(readFileSync(join(FIX, "vercel.json"), "utf8")).toBe(vercelJsonBefore);
    expect(existsSync(join(DIST, "config.json"))).toBe(false);
    expect(existsSync(join(DIST, "functions"))).toBe(false);
  });

  test("server.mjs is self-contained (no bare imports left)", () => {
    const code = readFileSync(join(DIST, "server.mjs"), "utf8");
    const bare = [...code.matchAll(/\bfrom\s*"([^"]+)"/g)]
      .map((m) => m[1] ?? "")
      .filter((s) => !isBuiltin(s) && s !== "bun");
    expect(bare).toEqual([]);
  });
});

describe("dist/server.mjs at runtime", () => {
  let dir = "";
  let proc: Subprocess | null = null;
  let base = "";

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "sr-multivrs-"));
    cpSync(DIST, dir, { recursive: true });
    const port = 20000 + Math.floor(Math.random() * 20000);
    base = `http://127.0.0.1:${port}`;
    proc = spawn(["bun", "server.mjs"], {
      cwd: dir,
      env: { ...envWithout("SERVER_REGION"), PORT: String(port) },
      stdout: "pipe",
      stderr: "pipe",
    });
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      try {
        await fetch(`${base}/`);
        return;
      } catch {
        await Bun.sleep(100);
      }
    }
    throw new Error("server.mjs did not start within 15s");
  }, 30_000);

  afterAll(() => {
    proc?.kill();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  for (const c of ENDPOINT_CASES) {
    test(`endpoint contract: ${c.name}`, () => runEndpointCase(base, c));
  }

  test("concurrent requests keep their own loader data across Suspense", () =>
    expectIsolatedRouteContext(async (path) => (await fetch(`${base}${path}`)).text()));

  test("API errors return a generic 500 and reach instrumentation.onRequestError", async () => {
    const res = await fetch(`${base}/api/boom`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error" });
    const inst = (await (await fetch(`${base}/api/instrumentation`)).json()) as {
      lastError: string | null;
    };
    expect(inst.lastError).toBe("/api/boom: secret internal detail");
  });

  test("only registered action modules can be called", async () => {
    const res = await fetch(`${base}/_swift-rust/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actionId: "src/app/layout.tsx#default", args: [] }),
    });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(false);
  });

  test("<Form action> on a server-rendered page carries the action id", async () => {
    const html = await (await fetch(`${base}/serveraction-ssr`)).text();
    expect(html).toContain('action="/_swift-rust/action"');
    expect(html).toContain('value="src/app/actions.ts#addItem"');
  });

  test("serves dynamic [param] routes with .env.production defaults and islands", async () => {
    const res = await fetch(`${base}/item/widget-42`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("widget-42");
    expect(html).toContain('data-api="https://prod.example.com"');
    expect(html).toContain('data-region="from-env-file"');
    expect(html).toMatch(
      /<script type="module" src="\/_swift-rust\/island\/[a-z0-9]+\.js"><\/script>/,
    );
  });

  test("serves trailing-slash and catch-all routes", async () => {
    expect((await fetch(`${base}/item/x/`)).status).toBe(200);
    const docs = await (await fetch(`${base}/docs/getting-started`)).text();
    expect(docs).toMatch(/docs-slug:(?:<!-- -->)?getting-started/);
  });

  test("runs the guard/loader pipeline on function routes", async () => {
    const denied = await fetch(`${base}/dash`, { redirect: "manual" });
    expect(denied.status).toBe(307);
    const ok = await (await fetch(`${base}/dash?ok=1`)).text();
    expect(ok).toContain("<title>Dashboard</title>");
  });

  test("returns 404 for unknown paths", async () => {
    const res = await fetch(`${base}/definitely/not/here`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("404");
  });

  test("serves the image route from the server", async () => {
    const missing = await fetch(`${base}/_swift-rust/image?url=%2Fnope.png&w=640`, {
      redirect: "manual",
    });
    expect(missing.status).toBe(307);
    expect(missing.headers.get("location")).toBe("/nope.png");
    expect((await fetch(`${base}/_swift-rust/image`)).status).toBe(400);
  });
});

describe("dist/server.mjs reads env at request time", () => {
  test("runtime env overrides .env.production values", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sr-multivrs-env-"));
    cpSync(join(DIST, "server.mjs"), join(dir, "server.mjs"));
    const port = 20000 + Math.floor(Math.random() * 20000);
    const proc = spawn(["bun", "server.mjs"], {
      cwd: dir,
      env: { ...process.env, PORT: String(port), SERVER_REGION: "injected-at-start" },
      stdout: "ignore",
      stderr: "ignore",
    });
    try {
      let html = "";
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        try {
          html = await (await fetch(`http://127.0.0.1:${port}/item/1`)).text();
          break;
        } catch {
          await Bun.sleep(100);
        }
      }
      expect(html).toContain('data-region="injected-at-start"');
    } finally {
      proc.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
