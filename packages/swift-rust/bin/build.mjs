#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  existsSync,
  statSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  cpSync,
  openSync,
  unlinkSync,
} from "node:fs";
import { delimiter, join, resolve, dirname, basename, sep, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import {
  isAbsoluteBuildPath,
  isLocalBuildSpecifier,
} from "./runtime/path-specifier.mjs";
import { diagnose, noAppDirDiagnostic, renderTerminal } from "./diagnostics.mjs";
import { normalizeBuildError } from "./error-overlay.mjs";
import {
  MULTIVRS_BINARY,
  MULTIVRS_MANIFEST,
  MULTIVRS_STATIC_DIR,
  buildMultivrsManifest,
  resolveBuildTarget,
  routeSrc,
  sortBySegments,
  validateMultivrsManifest,
} from "./targets.mjs";

const cwd = process.cwd();
const APP_DIR_CANDIDATES = [resolve(cwd, "src", "app"), resolve(cwd, "app")];
const APP_DIR = APP_DIR_CANDIDATES.find((p) => existsSync(p)) ?? resolve(cwd, "app");
const PUBLIC_DIR = resolve(cwd, "public");
const RUNTIME_DIR = resolve(fileURLToPath(import.meta.url), "..", "runtime");
const MULTIVRS_SERVER_RUNTIME = resolve(fileURLToPath(import.meta.url), "..", "multivrs-server.mjs");

function readProjectConfig() {
  const file = resolve(cwd, "swift-rust.config.json");
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")) || {};
  } catch {
    return {};
  }
}

let BUILD_TARGET;
let TARGET_SOURCE;
try {
  ({ target: BUILD_TARGET, source: TARGET_SOURCE } = resolveBuildTarget({
    argv: process.argv.slice(2),
    env: process.env,
    config: readProjectConfig(),
  }));
} catch (e) {
  process.stderr.write(`error: ${e.message}\n  = help: swift-rust build --target multivrs | --target vercel\n`);
  process.exit(1);
}
const IS_VERCEL = BUILD_TARGET === "vercel";
const OUT_DIR = IS_VERCEL ? resolve(cwd, ".vercel", "output") : resolve(cwd, "dist");
const STATIC_DIR = join(OUT_DIR, IS_VERCEL ? "static" : MULTIVRS_STATIC_DIR);
const OUT_LABEL = IS_VERCEL ? ".vercel/output" : "dist";
const serverRoutes = [];

const ROUTING_EXTS = [".tsx", ".ts", ".jsx", ".js"];
const ISLAND_EXTS = [".tsx", ".ts", ".jsx", ".js", ".mjs"];

function parseEnvFile(filePath) {
  const out = {};
  if (!existsSync(filePath)) return out;
  try {
    const content = readFileSync(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const cleaned = line.startsWith("export ") ? line.slice(7).trim() : line;
      const m = cleaned.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        const quote = val[0];
        val = val.slice(1, -1);
        if (quote === '"') {
          val = val.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        }
      } else {
        const hashIdx = val.indexOf(" #");
        if (hashIdx !== -1) val = val.slice(0, hashIdx).trim();
      }
      out[key] = val;
    }
  } catch {}
  return out;
}

let _envDefines = null;
const _fileEnv = {};
function getEnvDefines() {
  if (_envDefines) return _envDefines;
  const dotEnv = parseEnvFile(resolve(cwd, ".env"));
  const dotEnvLocal = parseEnvFile(resolve(cwd, ".env.local"));
  const dotEnvProd = parseEnvFile(resolve(cwd, ".env.production"));
  const dotEnvProdLocal = parseEnvFile(resolve(cwd, ".env.production.local"));
  const mergedFileEnv = { ...dotEnv, ...dotEnvLocal, ...dotEnvProd, ...dotEnvProdLocal };
  const defines = {
    "process.env.NODE_ENV": JSON.stringify("production"),
  };
  for (const [k, fileVal] of Object.entries(mergedFileEnv)) {
    const procVal = process.env[k];
    const prodVal = dotEnvProdLocal[k] ?? dotEnvProd[k];
    const isAutoLoadedFromDotEnv =
      procVal !== undefined &&
      prodVal !== undefined &&
      (procVal === dotEnv[k] || procVal === dotEnvLocal[k]) &&
      prodVal !== procVal;
    const resolved = procVal !== undefined && !isAutoLoadedFromDotEnv ? procVal : fileVal;
    process.env[k] = resolved;
    _fileEnv[k] = resolved;
    defines[`process.env.${k}`] = JSON.stringify(resolved);
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (
      v !== undefined &&
      (k.startsWith("SWIFT_RUST_PUBLIC_") || k.startsWith("NEXT_PUBLIC_")) &&
      !(`process.env.${k}` in defines)
    ) {
      defines[`process.env.${k}`] = JSON.stringify(v);
    }
  }
  _envDefines = defines;
  return defines;
}

const isPublicEnvKey = (k) => k.startsWith("SWIFT_RUST_PUBLIC_") || k.startsWith("NEXT_PUBLIC_");

function getServerDefines() {
  const out = {};
  for (const [key, value] of Object.entries(getEnvDefines())) {
    const name = key.slice("process.env.".length);
    if (name === "NODE_ENV" || isPublicEnvKey(name)) out[key] = value;
  }
  return out;
}

function getServerEnvDefaults() {
  getEnvDefines();
  const out = {};
  for (const [k, v] of Object.entries(_fileEnv)) if (!isPublicEnvKey(k)) out[k] = v;
  return out;
}

// Scan a file's leading directives for a runtime / guard opt-in.
function scanFileDirectives(file) {
  const out = { runtime: null, guard: false };
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) continue;
      const m = t.match(/^["']use (bun|edge|node|worker|guard)["'];?$/);
      if (m) {
        if (m[1] === "guard") out.guard = true;
        else if (!out.runtime) out.runtime = m[1];
        continue;
      }
      if (/^["']use [a-z]+["'];?$/.test(t)) continue;
      break;
    }
  } catch {}
  return out;
}

// Source-level detection of a route's runtime/guard opt-in (page + layouts),
// so dynamic routes are emitted even when a build-time GET redirects.
function scanDirectives(pageFile) {
  const { layouts, templates } = collectChainFiles(pageFile);
  let runtime = null;
  let guard = false;
  for (const f of [pageFile, ...layouts.map((l) => l.file).filter(Boolean), ...(templates || []).filter(Boolean)]) {
    const d = scanFileDirectives(f);
    if (d.runtime && !runtime) runtime = d.runtime;
    if (d.guard) guard = true;
  }
  return { runtime, guardEnabled: guard };
}

function findRoutingFile(dir, base) {
  for (const ext of ROUTING_EXTS) {
    const f = join(dir, `${base}${ext}`);
    if (existsSync(f)) return f;
  }
  return null;
}

// Collect the routing files along a page's dir chain (outer → inner) plus the
// URL pattern segments (with [param] markers preserved). Mirrors the dev
// server's pipeline so the emitted function has the same behavior.
function collectChainFiles(pageFile) {
  const layouts = []; // { file, slots: [{ name, file }] }
  const templates = []; // (file | null) per segment
  const proxies = [];
  const schemas = [];
  const guards = [];
  const loaders = [];
  let actionFile = null;
  let queryFile = null;
  let stateFile = null;
  let seoFile = null;
  let i18nFile = null;
  let revalidateFile = null;
  const pattern = [];
  const pageDir = dirname(pageFile);
  const rel = pageDir.slice(APP_DIR.length).replace(/^[/\\]/, "");
  const segs = rel ? rel.split(sep) : [];
  if (APP_DIR.endsWith(`${sep}app`) && dirname(APP_DIR).endsWith(`${sep}src`)) {
    const rp = findRoutingFile(dirname(APP_DIR), "proxy");
    if (rp) proxies.push(rp);
  }
  const slotsFor = (d) => {
    const out = [];
    const subpath = relative(d, pageDir);
    try {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory() && e.name.startsWith("@")) {
          const sd = join(d, e.name);
          let file = null;
          if (subpath) {
            const nested = join(sd, subpath);
            if (existsSync(nested)) {
              file = findRoutingFile(nested, "page") || findRoutingFile(nested, "fragment") || findRoutingFile(nested, "default");
            }
          }
          if (!file) {
            file = findRoutingFile(sd, "page") || findRoutingFile(sd, "fragment") || findRoutingFile(sd, "default");
          }
          if (file) out.push({ name: e.name.slice(1), file });
        }
      }
    } catch {}
    return out;
  };
  let dir = APP_DIR;
  const scan = (d, isLeaf) => {
    const l = findRoutingFile(d, "layout");
    const t = findRoutingFile(d, "template");
    layouts.push({ file: l, slots: slotsFor(d) });
    templates.push(t);
    const p = findRoutingFile(d, "proxy");
    if (p) proxies.push(p);
    const s = findRoutingFile(d, "schema");
    if (s) schemas.push(s);
    const g = findRoutingFile(d, "guard");
    if (g) guards.push(g);
    const ld = findRoutingFile(d, "loader");
    if (ld) loaders.push(ld);
    const q = findRoutingFile(d, "query");
    if (q) queryFile = q;
    const st = findRoutingFile(d, "state");
    if (st) stateFile = st;
    const se = findRoutingFile(d, "seo");
    if (se) seoFile = se;
    const i = findRoutingFile(d, "i18n");
    if (i) i18nFile = i;
    const rv = findRoutingFile(d, "revalidate");
    if (rv) revalidateFile = rv;
    if (isLeaf) {
      const a = findRoutingFile(d, "action");
      if (a) actionFile = a;
    }
  };
  scan(dir, segs.length === 0);
  for (let i = 0; i < segs.length; i++) {
    dir = join(dir, segs[i]);
    pattern.push(segs[i]);
    scan(dir, i === segs.length - 1);
  }
  return { layouts, templates, proxies, schemas, guards, loaders, actionFile, queryFile, stateFile, seoFile, i18nFile, revalidateFile, pattern };
}

function isClientPageFile(file) {
  return scanFileDirectivesRaw(file).includes("client");
}
function scanFileDirectivesRaw(file) {
  const found = [];
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) continue;
      const m = t.match(/^["']use ([a-z]+)["'];?$/);
      if (m) {
        found.push(m[1]);
        continue;
      }
      break;
    }
  } catch {}
  return found;
}

function serializeRobots(data) {
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object") return "";
  const lines = [];
  const rules = Array.isArray(data.rules) ? data.rules : data.rules ? [data.rules] : [];
  for (const rule of rules) {
    const agents = Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent || "*"];
    for (const a of agents) lines.push(`User-agent: ${a}`);
    const allows = Array.isArray(rule.allow) ? rule.allow : rule.allow ? [rule.allow] : [];
    for (const al of allows) lines.push(`Allow: ${al}`);
    const disallows = Array.isArray(rule.disallow) ? rule.disallow : rule.disallow ? [rule.disallow] : [];
    for (const d of disallows) lines.push(`Disallow: ${d}`);
    if (rule.crawlDelay) lines.push(`Crawl-delay: ${rule.crawlDelay}`);
  }
  if (data.sitemap) {
    const sitemaps = Array.isArray(data.sitemap) ? data.sitemap : [data.sitemap];
    for (const s of sitemaps) lines.push(`Sitemap: ${s}`);
  }
  if (data.host) lines.push(`Host: ${data.host}`);
  return lines.join("\n") + "\n";
}

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
    }
  });
}

function serializeSitemap(items) {
  if (typeof items === "string") return items;
  if (!Array.isArray(items)) return "";
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const item of items) {
    if (!item || !item.url) continue;
    xml += "  <url>\n";
    xml += `    <loc>${escapeXml(item.url)}</loc>\n`;
    if (item.lastModified) {
      const d = item.lastModified instanceof Date ? item.lastModified.toISOString() : String(item.lastModified);
      xml += `    <lastmod>${escapeXml(d)}</lastmod>\n`;
    }
    if (item.changeFrequency) {
      xml += `    <changefreq>${escapeXml(item.changeFrequency)}</changefreq>\n`;
    }
    if (item.priority !== undefined && item.priority !== null) {
      xml += `    <priority>${Number(item.priority).toFixed(1)}</priority>\n`;
    }
    xml += "  </url>\n";
  }
  xml += "</urlset>\n";
  return xml;
}

function resolveIslandSpecifier(spec, importer) {
  const bases = [];
  if (spec.startsWith("@/")) {
    bases.push(resolve(cwd, "src", spec.slice(2)), resolve(cwd, spec.slice(2)));
  } else if (isAbsoluteBuildPath(spec)) {
    bases.push(spec);
  } else if (spec.startsWith(".")) {
    bases.push(resolve(dirname(importer || cwd), spec));
  } else {
    return null;
  }
  for (const base of bases) {
    const candidates = [base, ...ISLAND_EXTS.map((e) => base + e), ...ISLAND_EXTS.map((e) => join(base, `index${e}`))];
    for (const c of candidates) {
      try {
        if (statSync(c).isFile()) return c;
      } catch {}
    }
  }
  return null;
}

function detectIslandExports(src) {
  const named = new Set();
  let hasDefault = false;
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  if (/\bexport\s+default\b/.test(code)) hasDefault = true;
  for (const m of code.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    named.add(m[1]);
  }
  for (const m of code.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && name !== "default") named.add(name);
    }
  }
  return { hasDefault, named: [...named] };
}

function islandWrapperSource(abs, temps) {
  const src = readFileSync(abs, "utf8");
  const { hasDefault, named } = detectIslandExports(src);
  const rawName = `.__sr_raw_${process.pid}_${Math.random().toString(36).slice(2)}__${basename(abs)}`;
  const rawPath = join(dirname(abs), rawName);
  writeFileSync(rawPath, src);
  temps.push(rawPath);
  const rawSpec = JSON.stringify(rawPath);
  let out = `import { createElement as __h } from "react";
import * as __real from ${rawSpec};
const __src = ${JSON.stringify(abs)};
function __ser(props){
  var out = {};
  for (var k in props){
    if (k === "children") continue;
    var v = props[k]; var t = typeof v;
    if (v === null || t === "string" || t === "number" || t === "boolean" || (t === "object" && typeof v.$$typeof === "undefined")){
      try { JSON.stringify(v); out[k] = v; } catch (e) {}
    }
  }
  return JSON.stringify(out).replace(/</g, "\\\\u003c");
}
function __wrap(Comp, name){
  if (typeof Comp !== "function") return Comp;
  function SrIsland(props){
    return __h("div", {
      "data-sr-island": "",
      "data-sr-island-src": __src,
      "data-sr-island-export": name,
      "data-sr-island-props": __ser(props),
      style: { display: "contents" },
    }, __h(Comp, props));
  }
  SrIsland.displayName = "Island(" + name + ")";
  return SrIsland;
}
`;
  if (hasDefault) out += `export default __wrap(__real.default, "default");\n`;
  for (const n of named) {
    if (/^[A-Z]/.test(n)) out += `export const ${n} = __wrap(__real[${JSON.stringify(n)}], ${JSON.stringify(n)});\n`;
    else out += `export const ${n} = __real[${JSON.stringify(n)}];\n`;
  }
  return out;
}

function makeClientIslandPlugin(temps, discoveredIslands, pageFiles) {
  return {
    name: "sr-client-islands",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        const p = args.path;
        if (!isLocalBuildSpecifier(p)) return undefined;
        if (/\.__sr_raw_/.test(p) || /\.__sr_fn_/.test(p)) return { path: p, namespace: "file" };
        if (args.importer && isClientPageFile(args.importer)) return undefined;
        const abs = resolveIslandSpecifier(p, args.importer);
        if (!abs || pageFiles.has(abs) || !isClientPageFile(abs)) return undefined;
        discoveredIslands.add(abs);
        return { path: abs, namespace: "sr-island" };
      });
      build.onLoad({ filter: /.*/, namespace: "sr-island" }, (args) => ({
        contents: islandWrapperSource(args.path, temps),
        loader: "js",
        resolveDir: dirname(args.path),
      }));
    },
  };
}

// Build a client-island bundle for a "use client" page (served by the dev
// server during build) and write it to the static output. Returns its URL.
async function buildIslandAsset(pageFile) {
  try {
    const res = await fetch(`http://${HOST}:${PORT}/_swift-rust/island.js?p=${encodeURIComponent(pageFile)}`);
    if (!res.ok) return null;
    const code = await res.text();
    const rel = `_swift-rust/island/${simpleHash(pageFile)}.js`;
    writeRawFile(STATIC_DIR, rel, code);
    return `/${rel}`;
  } catch {
    return null;
  }
}

async function buildComponentIslandAsset(islandFile) {
  const enc = encodeURIComponent(islandFile);
  const key = `island-comp.js:${enc}`;
  const cached = islandWritten.get(key);
  if (cached) return cached;
  const entryPath = join(
    dirname(islandFile),
    `.__sr_cisland_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}.js`,
  );
  const entry = `import { hydrateRoot, createRoot } from "react-dom/client";
import { createElement } from "react";
import * as __mod from ${JSON.stringify(islandFile)};
var __src = ${JSON.stringify(islandFile)};
var nodes = document.querySelectorAll('[data-sr-island]');
for (var i = 0; i < nodes.length; i++) {
  var el = nodes[i];
  if (el.getAttribute("data-sr-island-src") !== __src || el.__srHydrated) continue;
  el.__srHydrated = true;
  var name = el.getAttribute("data-sr-island-export") || "default";
  var Comp = __mod[name] || __mod.default;
  if (typeof Comp !== "function") { console.warn("[swift-rust] island export missing:", name, __src); continue; }
  var props = {};
  try { props = JSON.parse(el.getAttribute("data-sr-island-props") || "{}"); } catch (e) {}
  var element = createElement(Comp, props);
  try { hydrateRoot(el, element); }
  catch (err) { el.innerHTML = ""; createRoot(el).render(element); }
}
`;
  writeFileSync(entryPath, entry);
  try {
    const result = await Bun.build({
      entrypoints: [entryPath],
      target: "browser",
      minify: true,
      define: getEnvDefines(),
    });
    if (result.success && result.outputs[0]) {
      const code = await result.outputs[0].text();
      const rel = `_swift-rust/island/${simpleHash(key)}.js`;
      writeRawFile(STATIC_DIR, rel, code);
      const staticUrl = `/${rel}`;
      islandWritten.set(key, staticUrl);
      return staticUrl;
    }
  } catch {} finally {
    try {
      unlinkSync(entryPath);
    } catch {}
  }
  try {
    const { status, body } = await fetchRoute(`/_swift-rust/island-comp.js?p=${enc}`);
    if (status === 200 && body) {
      const rel = `_swift-rust/island/${simpleHash(key)}.js`;
      writeRawFile(STATIC_DIR, rel, body);
      const staticUrl = `/${rel}`;
      islandWritten.set(key, staticUrl);
      return staticUrl;
    }
  } catch {}
  return null;
}

function routeHandlerOptions({ pageFile, ns, runtime, head, guardEnabled, isClient, islandSrc, bodyScriptsSource }) {
  const f = collectChainFiles(pageFile);
  const arr = (files) => `[${files.map((file) => ns(file)).join(", ")}]`;
  const opt = (file) => (file ? ns(file) : "undefined");
  const pageNs = ns(pageFile);
  const layoutsArr = `[${f.layouts.map((l) => (l.file ? ns(l.file) : "null")).join(", ")}]`;
  const templatesArr = `[${(f.templates || []).map((t) => (t ? ns(t) : "null")).join(", ")}]`;
  const slotsArr = `[${f.layouts.map((l) => `[${l.slots.map((s) => `{ name: ${JSON.stringify(s.name)}, mod: ${ns(s.file)} }`).join(", ")}]`).join(", ")}]`;
  const proxiesArr = arr(f.proxies);
  const schemasArr = arr(f.schemas);
  const guardsArr = arr(f.guards);
  const loadersArr = arr(f.loaders);
  const actionNs = opt(f.actionFile);
  const queryNs = opt(f.queryFile);
  const stateNs = opt(f.stateFile);
  const seoNs = opt(f.seoFile);
  const i18nNs = opt(f.i18nFile);
  const revNs = opt(f.revalidateFile);
  return (
    `{\n` +
    `  page: ${pageNs}, layouts: ${layoutsArr}, templates: ${templatesArr}, layoutMetas: ${layoutsArr}, slots: ${slotsArr},\n` +
    `  proxies: ${proxiesArr}, schemas: ${schemasArr}, guards: ${guardsArr}, guardEnabled: ${guardEnabled ? "true" : "false"},\n` +
    `  action: ${actionNs}, loaders: ${loadersArr}, query: ${queryNs}, state: ${stateNs},\n` +
    `  seo: ${seoNs}, i18n: ${i18nNs}, revalidate: ${revNs},\n` +
    `  isClient: ${isClient ? "true" : "false"}, islandSrc: ${JSON.stringify(islandSrc || "")},\n` +
    `  bodyScripts: ${bodyScriptsSource},\n` +
    `  pattern: ${JSON.stringify(f.pattern)}, runtime: ${JSON.stringify(runtime)}, head: ${JSON.stringify(head)},\n` +
    `}`
  );
}

function findInstrumentationFile() {
  return [
    join(cwd, "src", "instrumentation.ts"),
    join(cwd, "src", "instrumentation.js"),
    join(cwd, "instrumentation.ts"),
    join(cwd, "instrumentation.js"),
  ].find((p) => existsSync(p));
}

// Bundle one route's request-time handler. On the Vercel target it is written
// as a .func; on Multivrs it is recorded for the single server bundle.
async function emitFunction({ route, funcRel, segments, pageFile, runtime, head, guardEnabled, isClient, islandSrc }) {
  if (typeof Bun === "undefined" || typeof Bun.build !== "function") return false;
  const fnCore = join(RUNTIME_DIR, "fn-core.mjs");
  const imports = [`import { makeRouteHandler } from ${JSON.stringify(fnCore)};`];
  let uid = 0;
  const ns = (file) => {
    const name = `__m${uid++}`;
    imports.push(`import * as ${name} from ${JSON.stringify(file)};`);
    return name;
  };

  // IMPORTANT: resolve every ns() (which appends to `imports`) BEFORE joining
  // `imports` — otherwise body-only modules go unimported.
  const handlerOpts = routeHandlerOptions({
    pageFile,
    ns,
    runtime,
    head,
    guardEnabled,
    isClient,
    islandSrc,
    bodyScriptsSource: `"__SR_BODY_SCRIPTS_PLACEHOLDER__"`,
  });

  const instCandidate = findInstrumentationFile();
  let instBootstrap = "";
  if (instCandidate) {
    const instNs = ns(instCandidate);
    instBootstrap = `if (typeof ${instNs}.register === "function") await ${instNs}.register();\n`;
  }

  const entry =
    `${imports.join("\n")}\n` +
    `${instBootstrap}` +
    `const handler = makeRouteHandler(${handlerOpts});\n` +
    `export default handler;\n` +
    `export const fetch = handler;\n` +
    `export const GET = handler;\n` +
    `export const HEAD = handler;\n` +
    `export const POST = handler;\n` +
    `export const PUT = handler;\n` +
    `export const DELETE = handler;\n` +
    `export const PATCH = handler;\n` +
    `export const OPTIONS = handler;\n`;

  const rel = funcRel || (route === "/" ? "index.func" : `${route.replace(/^\//, "")}.func`);
  const funcDir = join(OUT_DIR, "functions", rel);
  const entryTmp = join(APP_DIR, `.__sr_fn_${process.pid}_${simpleHash(rel)}.js`);
  writeFileSync(entryTmp, entry);
  const temps = [];
  const discoveredIslands = new Set();
  try {
    const isEdge = runtime === "edge";
    const result = await Bun.build({
      entrypoints: [entryTmp],
      target: isEdge ? "browser" : "node",
      format: "esm",
      minify: true,
      define: getEnvDefines(),
      plugins: [makeClientIslandPlugin(temps, discoveredIslands, new Set([pageFile]))],
      external: isEdge ? ["react-dom/server"] : [],
    });
    if (!result.success) {
      const wrapped = normalizeBuildError(new Error("Bundle failed"), result.logs, cwd);
      const diagnostic = diagnose(wrapped, { cwd, pageFile, context: `while bundling the function for ${route || rel}` });
      const error = new Error(diagnostic.title);
      error.diagnostic = diagnostic;
      throw error;
    }
    const islandScripts = [];
    for (const islandFile of discoveredIslands) {
      const staticUrl = await buildComponentIslandAsset(islandFile);
      if (staticUrl) islandScripts.push(`<script type="module" src="${staticUrl}"></script>`);
    }
    const bodyScripts = islandScripts.join("");
    if (!IS_VERCEL) {
      serverRoutes.push({ segments, pageFile, runtime: "bun", head, guardEnabled, isClient, islandSrc, bodyScripts });
      return true;
    }
    mkdirSync(funcDir, { recursive: true });
    let code = await result.outputs[0].text();
    code = code.replace(/["'`]__SR_BODY_SCRIPTS_PLACEHOLDER__["'`]/g, JSON.stringify(bodyScripts));
    writeFileSync(join(funcDir, "index.js"), code);
    if (!isEdge) {
      writeFileSync(join(funcDir, "package.json"), '{\n  "type": "module"\n}\n');
    }
    const vcConfig = isEdge
      ? { runtime: "edge", entrypoint: "index.js" }
      : { runtime: "nodejs22.x", handler: "index.js", launcherType: "Nodejs", supportsResponseStreaming: true };
    writeFileSync(join(funcDir, ".vc-config.json"), `${JSON.stringify(vcConfig, null, 2)}\n`);
    return true;
  } finally {
    try {
      unlinkSync(entryTmp);
    } catch {}
    for (const t of temps) {
      try {
        unlinkSync(t);
      } catch {}
    }
  }
}

// Multivrs: bundle every server route, the image route and the router into
// one self-contained dist/server.mjs (no node_modules at runtime).
async function buildMultivrsServer(notFoundHtml) {
  const fnCore = join(RUNTIME_DIR, "fn-core.mjs");
  const tag = `${process.pid}_${Date.now()}`;
  const envTmp = join(APP_DIR, `.__sr_fn_${tag}_env.js`);
  const entryTmp = join(APP_DIR, `.__sr_fn_${tag}_server.js`);
  const imports = [
    `import ${JSON.stringify(envTmp)};`,
    `import { makeRouteHandler } from ${JSON.stringify(fnCore)};`,
    `import { startServer } from ${JSON.stringify(MULTIVRS_SERVER_RUNTIME)};`,
  ];
  const nsNames = new Map();
  const ns = (file) => {
    if (!nsNames.has(file)) {
      const name = `__m${nsNames.size}`;
      nsNames.set(file, name);
      imports.push(`import * as ${name} from ${JSON.stringify(file)};`);
    }
    return nsNames.get(file);
  };
  const routeLines = sortBySegments(serverRoutes).map((r) => {
    const opts = routeHandlerOptions({ ...r, ns, bodyScriptsSource: JSON.stringify(r.bodyScripts) });
    return `  { src: ${JSON.stringify(routeSrc(r.segments))}, handler: makeRouteHandler(${opts}) },`;
  });
  const instFile = findInstrumentationFile();
  const register = instFile ? `${ns(instFile)}.register` : "undefined";
  const entry =
    `${imports.join("\n")}\n` +
    `await startServer({\n` +
    `  routes: [\n${routeLines.join("\n")}\n  ],\n` +
    `  notFoundHtml: ${JSON.stringify(notFoundHtml)},\n` +
    `  staticDir: ${JSON.stringify(MULTIVRS_STATIC_DIR)},\n` +
    `  register: ${register},\n` +
    `});\n`;
  const envDefaults = getServerEnvDefaults();
  writeFileSync(
    envTmp,
    `const defaults = ${JSON.stringify(envDefaults)};\n` +
      `for (const k of Object.keys(defaults)) if (process.env[k] === undefined) process.env[k] = defaults[k];\n`,
  );
  writeFileSync(entryTmp, entry);
  const temps = [];
  try {
    const result = await Bun.build({
      entrypoints: [entryTmp],
      target: "bun",
      format: "esm",
      minify: true,
      define: getServerDefines(),
      plugins: [makeClientIslandPlugin(temps, new Set(), new Set(serverRoutes.map((r) => r.pageFile)))],
    });
    if (!result.success) {
      const wrapped = normalizeBuildError(new Error("Bundle failed"), result.logs, cwd);
      const diagnostic = diagnose(wrapped, { cwd, context: "while bundling dist/server.mjs" });
      const error = new Error(diagnostic.title);
      error.diagnostic = diagnostic;
      throw error;
    }
    const out = result.outputs.find((o) => o.kind === "entry-point") || result.outputs[0];
    writeFileSync(join(OUT_DIR, MULTIVRS_BINARY), await out.text());
  } finally {
    for (const t of [envTmp, entryTmp, ...temps]) {
      try {
        unlinkSync(t);
      } catch {}
    }
  }
}

function writeMultivrsManifest(staticRoutes) {
  const manifest = buildMultivrsManifest([
    ...serverRoutes.map((r) => ({ segments: r.segments, renderMode: "ssr", runtime: "bun" })),
    ...staticRoutes.map((route) => ({ segments: route.split("/").filter(Boolean), renderMode: "wasm" })),
  ]);
  const problems = validateMultivrsManifest(manifest);
  if (problems.length) throw new Error(`invalid ${MULTIVRS_MANIFEST}: ${problems.join("; ")}`);
  writeFileSync(join(OUT_DIR, MULTIVRS_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

// Vercel runs functions on Bun when vercel.json sets bunVersion. Ensure it's
// present (preserving the rest of the file) so 'use bun' routes run on Bun.
function ensureBunVersion() {
  const file = resolve(cwd, "vercel.json");
  let json = {};
  if (existsSync(file)) {
    try {
      json = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      json = {};
    }
  }
  if (json.bunVersion) return;
  json.bunVersion = "1.x";
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  process.stdout.write(`  ${paint("cyan", "•")} set ${paint("bold", 'vercel.json "bunVersion": "1.x"')} for Bun functions\n`);
}

// Locate the bundled local fonts (installed @swift-rust/font, else monorepo).
function resolveLocalFontDir() {
  const candidates = [];
  try {
    const req = createRequire(import.meta.url);
    const pkg = req.resolve("@swift-rust/font/package.json");
    candidates.push(join(dirname(pkg), "src", "local"), join(dirname(pkg), "dist", "local"));
  } catch {}
  candidates.push(
    resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "packages", "font", "src", "local"),
  );
  return candidates.find((d) => existsSync(d)) ?? null;
}

const PORT_START = parseInt(process.env.SWIFT_RUST_BUILD_PORT || "47321", 10);
const HOST = "127.0.0.1";
let PORT = PORT_START;
const ROUTE_TIMEOUT_MS = 30_000;
const HEALTH_TIMEOUT_MS = 30_000;

const OPT_CATCH_PARAM = /^\[\[\.{3}([^\]]+)\]\]$/;
const CATCH_PARAM = /^\[\.{3}([^\]]+)\]$/;
const NAMED_PARAM = /^\[([^\]]+)\]$/;
const PAGE_EXTENSIONS = ["page.tsx", "page.ts", "page.jsx", "page.js"];
const NOT_FOUND_FILES = ["not-found.tsx", "not-found.ts", "not-found.jsx", "not-found.js"];

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  cyan: "\x1b[36m", gray: "\x1b[90m",
};
const useColor = process.stdout.isTTY !== false && !process.env.NO_COLOR;
const paint = (color, s) => (useColor ? `${c[color]}${s}${c.reset}` : s);
const fmtMs = (ms) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`);

let activeLogFile = null;

function findPageFile(dir) {
  for (const ext of PAGE_EXTENSIONS) {
    const p = join(dir, ext);
    if (existsSync(p)) return p;
  }
  return null;
}

function discoverPages(dir, base = "") {
  const pages = [];
  if (!existsSync(dir)) return pages;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    // Private folders (_folder) are excluded from routing
    if (entry.name.startsWith("_")) continue;
    // @slot dirs (parallel routes) are not URL segments — composed into layouts.
    if (entry.name.startsWith("@")) continue;
    // Intercepting route folders (.) are matched at runtime on soft navigations
    if (entry.name.startsWith("(.)") || entry.name.startsWith("(..)") || entry.name.startsWith("(...)")) continue;
    const full = join(dir, entry.name);
    let segName = entry.name;
    if (segName.startsWith("%5F") || segName.startsWith("%5f")) {
      segName = "_" + segName.slice(3);
    }
    if (entry.isDirectory()) {
      const optCatch = entry.name.match(OPT_CATCH_PARAM);
      if (optCatch) {
        const pageFile = findPageFile(full);
        if (pageFile) {
          pages.push({ type: "opt-catchall", dir: full, file: pageFile, base, paramName: optCatch[1] });
        }
        continue;
      }
      const catchAll = entry.name.match(CATCH_PARAM);
      if (catchAll) {
        const pageFile = findPageFile(full);
        if (pageFile) {
          pages.push({ type: "catchall", dir: full, file: pageFile, base, paramName: catchAll[1] });
        }
        continue;
      }
      const named = entry.name.match(NAMED_PARAM);
      if (named) {
        const pageFile = findPageFile(full);
        if (pageFile) {
          pages.push({ type: "dynamic", dir: full, file: pageFile, base, paramName: named[1] });
        }
        continue;
      }
      pages.push(...discoverPages(full, base + "/" + segName));
    } else if (PAGE_EXTENSIONS.includes(entry.name)) {
      pages.push({ type: "static", file: full, route: base || "/" });
    }
  }
  return pages;
}

function findNotFoundFile(dir) {
  for (const name of NOT_FOUND_FILES) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

async function enumerateParams(page) {
  for (const ext of PAGE_EXTENSIONS) {
    const p = join(page.dir, ext);
    if (!existsSync(p)) continue;
    try {
      const mod = await import(`${p}?t=${Date.now()}`);
      if (typeof mod.generateStaticParams === "function") {
        return await mod.generateStaticParams();
      }
    } catch {}
  }
  return [];
}

function routesFromParams(base, paramName, params, isOptional = false) {
  return params
    .map((p) => {
      const v = p[paramName];
      if (v == null || (Array.isArray(v) && v.length === 0)) {
        return isOptional ? (base || "/") : null;
      }
      return (base ? base + "/" : "/") + (Array.isArray(v) ? v.join("/") : String(v));
    })
    .filter(Boolean);
}

function findBun() {
  if (process.env.SWIFT_RUST_RUNTIME) return process.env.SWIFT_RUST_RUNTIME;
  if (process.versions?.bun) return process.execPath;
  const exe = process.platform === "win32" ? "bun.exe" : "bun";
  const candidates = [
    process.env.BUN_INSTALL ? join(process.env.BUN_INSTALL, "bin", exe) : null,
    join(process.env.USERPROFILE || "", ".bun", "bin", exe),
    join(process.env.HOME || "", ".bun", "bin", exe),
    ...String(process.env.PATH || "")
      .split(delimiter)
      .filter(Boolean)
      .map((dir) => join(dir, exe)),
    "/usr/local/bin/bun",
    "/opt/homebrew/bin/bun",
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

async function findFreePort(start) {
  const net = await import("node:net");
  const randomOffset = Math.floor(Math.random() * 5000);
  const initial = (start || 41000) + randomOffset;
  for (let p = initial; p < initial + 200; p++) {
    const ok = await new Promise((resolve) => {
      const sock = net.createServer();
      sock.once("error", () => resolve(false));
      sock.once("listening", () => sock.close(() => resolve(true)));
      sock.listen(p, HOST);
    });
    if (ok) return p;
  }
  throw new Error(`no free port in range ${initial}..${initial + 200}`);
}

function startDevServer(port, logFile) {
  const devServer = resolve(fileURLToPath(import.meta.url), "..", "dev-server.mjs");
  const runtime = findBun();
  if (!runtime) {
    throw new Error("swift-rust build requires Bun to prerender TS/TSX routes. Install Bun and make sure `bun` is on PATH.");
  }
  const stdio = logFile
    ? ["ignore", openSync(logFile, "w"), "inherit"]
    : ["ignore", "inherit", "inherit"];
  const proc = spawn(runtime, [devServer, "--port", String(port), "--hostname", HOST], {
    stdio,
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || "production",
      NO_COLOR: "1",
      SWIFT_RUST_BUILD: "1",
    },
    cwd,
  });
  proc.on("error", (e) => {
    const diagnostic = diagnose(e, { cwd, context: "while starting the prerender server" });
    process.stderr.write(`\n${renderTerminal(diagnostic, paint)}\n`);
  });
  return proc;
}

async function waitForServer(proc, timeoutMs = HEALTH_TIMEOUT_MS) {
  const start = Date.now();
  const url = `http://${HOST}:${PORT}/_swift-rust/health`;
  while (Date.now() - start < timeoutMs) {
    if (proc && proc.exitCode !== null) {
      let detail = "";
      try {
        if (activeLogFile && existsSync(activeLogFile)) {
          detail = `\nDev server log:\n` + readFileSync(activeLogFile, "utf8");
        }
      } catch {}
      throw new Error(`dev server exited unexpectedly with code ${proc.exitCode}.${detail}`);
    }
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`dev server did not become ready at ${url} within ${timeoutMs}ms`);
}

async function fetchRoute(pathname, timeoutMs = ROUTE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${HOST}:${PORT}${pathname}`, {
      signal: controller.signal,
      redirect: "manual",
    });
    return {
      status: res.status,
      body: await res.text(),
      runtime: res.headers.get("x-swift-rust-runtime") || "bun",
      dynamic: res.headers.get("x-swift-rust-dynamic") === "1",
      guardEnabled: res.headers.get("x-swift-rust-guard") === "1",
    };
  } finally {
    clearTimeout(timer);
  }
}

function tailDevLog(lines = 40) {
  if (!activeLogFile || !existsSync(activeLogFile)) return [];
  try {
    const all = readFileSync(activeLogFile, "utf8").split("\n");
    return all.slice(-lines);
  } catch {
    return [];
  }
}

function stripHmrScript(html) {
  return html.replace(/\s*<script src="\/_swift-rust\/hmr-client\.js"[^>]*>\s*<\/script>/g, "");
}

// The dev-time image endpoint (/_swift-rust/image) only exists while the dev
// server runs. On Vercel the platform serves an optimizing endpoint at
// /_vercel/image with the exact same query contract (url, w, q), so we swap the
// path prefix at build time. The `images` config written into config.json
// enables (and bounds) that optimizer. Handles `src`, `srcset`, and `&amp;`.
function rewriteImageUrls(html) {
  return html.split("/_swift-rust/image?").join("/_vercel/image?");
}

function writeStaticFile(outDir, pathname, html) {
  const rel = pathname === "/" ? "index.html" : `${pathname.replace(/^\//, "")}/index.html`;
  const outPath = join(outDir, rel);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);
}

// Writes a literal file (e.g. 404.html) at static/<name>, NOT static/<name>/index.html.
function writeRawFile(outDir, name, contents) {
  const outPath = join(outDir, name);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, contents);
}

// Client-island hydration: a "use client" page's HTML references the dev-only
// bundle at /_swift-rust/island.js?p=<file>. For the static export we fetch
// that bundle, write it as a real file, and rewrite the script src to point at
// it — so hydration works on the deployed site, not just in `bun dev`.
const islandWritten = new Map();
function simpleHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
async function localizeIslands(html) {
  let out = html;
  // Page-level islands (/_swift-rust/island.js) and component-level islands
  // (/_swift-rust/island-comp.js) both reference a dev-only bundle keyed by an
  // encoded source path. For the static export we fetch each bundle once, write
  // it as a real file, and rewrite the script src to point at it.
  for (const endpoint of ["island.js", "island-comp.js"]) {
    const re = new RegExp(`/_swift-rust/${endpoint.replace(".", "\\.")}\\?p=([^"]+)`, "g");
    const found = new Set();
    let m;
    while ((m = re.exec(out)) !== null) found.add(m[1]);
    for (const enc of found) {
      const key = `${endpoint}:${enc}`;
      let staticUrl = islandWritten.get(key);
      if (!staticUrl) {
        const { status, body } = await fetchRoute(`/_swift-rust/${endpoint}?p=${enc}`);
        if (status !== 200) continue;
        const rel = `_swift-rust/island/${simpleHash(key)}.js`;
        writeRawFile(STATIC_DIR, rel, body);
        staticUrl = `/${rel}`;
        islandWritten.set(key, staticUrl);
      }
      out = out.split(`/_swift-rust/${endpoint}?p=${enc}`).join(staticUrl);
    }
  }
  return out;
}

function writeConfigJson(outDir, _hasPublic, fnRoutes = []) {
  // Build Output API v3 config. Only schema-valid fields here — unknown
  // top-level fields or route properties are rejected at "Deploying outputs".
  const config = {
    version: 3,
    routes: [
      { src: "/_swift-rust/static/(.*)", headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
      { src: "/fonts/(.*)", headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
      // [param] / catch-all routes → their request-time function.
      ...fnRoutes,
      { handle: "filesystem" },
      { src: "^(.*)$", status: 404, dest: "/404.html" },
    ],
    overrides: {
      "404.html": { path: "404", contentType: "text/html; charset=utf-8" },
    },
    // Enables Vercel's image optimizer (/_vercel/image). `sizes` MUST match the
    // widths <Image> requests (packages/image DEVICE_SIZES) or requests 400.
    images: {
      sizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
      formats: ["image/avif", "image/webp"],
      minimumCacheTTL: 86400,
      // Allow optimizing local SVG assets (e.g. blog covers); sandboxed by CSP.
      dangerouslyAllowSVG: true,
      contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    },
  };
  writeFileSync(join(outDir, "config.json"), `${JSON.stringify(config, null, 2)}\n`);
}

async function main() {
  const start = Date.now();
  getEnvDefines();
  const targetLabel = IS_VERCEL ? "→ .vercel/output (BOA v3)" : "→ dist (Multivrs)";
  process.stdout.write(`\n  ${paint("cyan", "▲")} ${paint("bold", "swift-rust build")} ${paint("dim", targetLabel)}\n`);

  if (!existsSync(APP_DIR)) {
    process.stderr.write(`\n${renderTerminal(diagnose({ diagnostic: noAppDirDiagnostic(cwd) }, { cwd }), paint)}\n\n`);
    process.exit(1);
  }

  process.stdout.write(`  ${paint("dim", "app:   ")} ${paint("cyan", APP_DIR.replace(cwd + sep, ""))}\n`);
  process.stdout.write(`  ${paint("dim", "target:")} ${paint("cyan", BUILD_TARGET)} ${paint("dim", `(${TARGET_SOURCE})`)}\n`);
  process.stdout.write(`  ${paint("dim", "out:   ")} ${paint("cyan", OUT_LABEL)}\n\n`);

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(STATIC_DIR, { recursive: true });

  const pages = discoverPages(APP_DIR);
  const staticRoutes = pages.filter((p) => p.type === "static").map((p) => p.route);
  const optCatchalls = pages.filter((p) => p.type === "opt-catchall");
  const catchalls = pages.filter((p) => p.type === "catchall");
  const dynamics = pages.filter((p) => p.type === "dynamic");
  process.stdout.write(`  ${paint("dim", "•")} static routes: ${paint("bold", String(staticRoutes.length))}\n`);

  const paramFns = []; // dynamic pages with no static params → request-time functions
  for (const ca of optCatchalls) {
    const params = await enumerateParams(ca);
    if (params.length === 0) {
      paramFns.push(ca);
      process.stdout.write(`  ${paint("dim", "•")} opt-catch-all ${paint("cyan", ca.base + "/[[..." + ca.paramName + "]]")}: ${paint("cyan", "→ function")}\n`);
      continue;
    }
    const routes = routesFromParams(ca.base, ca.paramName, params, true);
    for (const r of routes) staticRoutes.push(r);
    process.stdout.write(`  ${paint("dim", "•")} opt-catch-all ${paint("cyan", ca.base + "/[[...]]")}: ${paint("bold", String(routes.length))}\n`);
  }
  for (const ca of catchalls) {
    const params = await enumerateParams(ca);
    if (params.length === 0) {
      paramFns.push(ca);
      process.stdout.write(`  ${paint("dim", "•")} catch-all ${paint("cyan", ca.base + "/[..." + ca.paramName + "]")}: ${paint("cyan", "→ function")}\n`);
      continue;
    }
    const routes = routesFromParams(ca.base, ca.paramName, params);
    for (const r of routes) staticRoutes.push(r);
    process.stdout.write(`  ${paint("dim", "•")} catch-all ${paint("cyan", ca.base + "/[...]")}: ${paint("bold", String(routes.length))}\n`);
  }
  for (const dyn of dynamics) {
    const params = await enumerateParams(dyn);
    if (params.length === 0) {
      paramFns.push(dyn);
      process.stdout.write(`  ${paint("dim", "•")} dynamic ${paint("cyan", dyn.base + "/[" + dyn.paramName + "]")}: ${paint("cyan", "→ function")}\n`);
      continue;
    }
    const routes = routesFromParams(dyn.base, dyn.paramName, params);
    for (const r of routes) staticRoutes.push(r);
    process.stdout.write(`  ${paint("dim", "•")} dynamic ${paint("cyan", dyn.base + "/[" + dyn.paramName + "]")}: ${paint("bold", String(routes.length))}\n`);
  }

  // route → page file (for static-type routes that may opt into a runtime fn).
  const routeToFile = new Map();
  for (const p of pages) if (p.type === "static") routeToFile.set(p.route, p.file);

  const allRoutes = [...new Set(staticRoutes)].sort();
  process.stdout.write(`  ${paint("dim", "•")} total: ${paint("bold", String(allRoutes.length))}\n\n`);

  process.stdout.write(`  ${paint("dim", "starting dev server on " + HOST + ":" + PORT_START + "…")}\n`);
  PORT = await findFreePort(PORT_START);
  process.stdout.write(`  ${paint("dim", "using port " + PORT + "\n")}\n`);
  activeLogFile =
    process.env.SWIFT_RUST_BUILD_LOG || join(tmpdir(), `swift-rust-build-dev-${process.pid}-${PORT}.log`);
  try { unlinkSync(activeLogFile); } catch {}
  const proc = startDevServer(PORT, activeLogFile);
  let okCount = 0;
  let skipCount = 0;
  let failCount = 0;
  let fnCount = 0;
  let usesBunFns = false;
  let fallbackHead = null;
  const fnConfigRoutes = [];
  const staticWritten = [];
  try {
    await waitForServer(proc);
    process.stdout.write(`  ${paint("green", "✓")} server ready\n\n`);

    for (const route of allRoutes) {
      try {
        const { status, body, runtime, dynamic, guardEnabled } = await fetchRoute(route);
        const pageFile = routeToFile.get(route);
        const localized = status === 200 ? await localizeIslands(stripHmrScript(body)) : null;
        const cleaned = localized && IS_VERCEL ? rewriteImageUrls(localized) : localized;
        if (cleaned && fallbackHead == null) {
          fallbackHead = (cleaned.match(/<head>([\s\S]*?)<\/head>/i) || [, ""])[1];
        }

        // Decide if this route is a request-time function. Prefer the live
        // headers (200 render); else fall back to a source directive scan so
        // guarded routes that redirect a build-time GET still get a function.
        let fnRuntime = null;
        let fnGuard = false;
        let fnHead = null;
        if (dynamic && pageFile) {
          fnRuntime = runtime;
          fnGuard = guardEnabled;
          fnHead = (cleaned?.match(/<head>([\s\S]*?)<\/head>/i) || [, ""])[1];
        } else if (pageFile && status !== 404) {
          const d = scanDirectives(pageFile);
          if (d.runtime) {
            fnRuntime = d.runtime;
            fnGuard = d.guardEnabled;
            fnHead = fallbackHead || "";
          }
        }

        if (fnRuntime && pageFile) {
          let emitted = false;
          const isClient = isClientPageFile(pageFile);
          const islandSrc = isClient ? await buildIslandAsset(pageFile) : null;
          try {
            emitted = await emitFunction({
              route,
              segments: route.split("/").filter(Boolean),
              pageFile,
              runtime: fnRuntime,
              head: fnHead,
              guardEnabled: fnGuard,
              isClient,
              islandSrc,
            });
          } catch (e) {
            printBuildError(e, `while emitting the function for ${route}`);
          }
          if (emitted) {
            fnCount++;
            if (fnRuntime === "bun") usesBunFns = true;
            process.stdout.write(`  ${paint("cyan", "ƒ")} ${route} ${paint("yellow", `[${fnRuntime}]`)}\n`);
            continue;
          }
        }

        if (status === 200) {
          writeStaticFile(STATIC_DIR, route, cleaned);
          staticWritten.push(route);
          okCount++;
          const rt = runtime && runtime !== "bun" ? ` ${paint("yellow", `[${runtime}]`)}` : "";
          process.stdout.write(`  ${paint("green", "✓")} ${route}${rt}\n`);
        } else if (status === 404) {
          skipCount++;
          process.stdout.write(`  ${paint("dim", "○")} ${route} ${paint("dim", "(404, skipped)")}\n`);
        } else {
          failCount++;
          process.stdout.write(`  ${paint("yellow", "!")} ${route} ${paint("dim", `(${status})`)}\n`);
          const embedded = diagnosticFromHtml(body);
          if (embedded) process.stdout.write(`\n${renderTerminal(embedded, paint)}\n`);
          else {
            const snippet = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
            if (snippet) process.stdout.write(`      ${paint("dim", snippet)}\n`);
          }
        }
      } catch (e) {
        failCount++;
        if (e?.name === "AbortError") {
          process.stdout.write(`  ${paint("red", "✗")} ${route} ${paint("dim", "timed out while rendering")}\n`);
        } else {
          printBuildError(e, `while rendering ${route}`);
        }
      }
    }

    // [param] / catch-all routes with no static params → one request-time
    // function each, matched via a config.json route.
    for (const dyn of paramFns) {
      const pageFile = dyn.file;
      const relDir = dirname(pageFile).slice(APP_DIR.length).replace(/^[/\\]/, "").split(sep).join("/");
      const funcRel = `${relDir}.func`;
      const { runtime: dirRt, guardEnabled: dirGuard } = scanDirectives(pageFile);
      const runtime = dirRt || "bun";
      const isClient = isClientPageFile(pageFile);
      const islandSrc = isClient ? await buildIslandAsset(pageFile) : null;
      let emitted = false;
      try {
        emitted = await emitFunction({
          funcRel,
          segments: relDir.split("/").filter(Boolean).map((seg) => seg.replace(/^%5F/i, "_")),
          pageFile,
          runtime,
          head: fallbackHead || "",
          guardEnabled: dirGuard,
          isClient,
          islandSrc,
        });
      } catch (e) {
        printBuildError(e, `while emitting the function for ${dyn.route || relDir}`);
      }
      if (emitted) {
        fnCount++;
        if (runtime === "bun") usesBunFns = true;
        let groupIdx = 0;
        const queryParts = [];
        let hasOptCatch = false;
        const srcSegs = relDir.split("/").map((s) => {
          if (s.startsWith("[[...") && s.endsWith("]]")) {
            hasOptCatch = true;
            groupIdx++;
            queryParts.push(`__sr_p${groupIdx - 1}=$${groupIdx}`);
            return "(?:/(.*))?";
          }
          if (s.startsWith("[...") && s.endsWith("]")) {
            groupIdx++;
            queryParts.push(`__sr_p${groupIdx - 1}=$${groupIdx}`);
            return "(.*)";
          }
          if (s.startsWith("[") && s.endsWith("]")) {
            groupIdx++;
            queryParts.push(`__sr_p${groupIdx - 1}=$${groupIdx}`);
            return "([^/]+)";
          }
          return s;
        });
        let src;
        if (hasOptCatch) {
          const parts = relDir.split("/");
          const optIdx = parts.findIndex((s) => s.startsWith("[[...") && s.endsWith("]]"));
          const prefix = parts.slice(0, optIdx).join("/");
          src = prefix ? `^/${prefix}(?:/(.*))?/?$` : `^/?(.*)$`;
        } else {
          src = `^/${srcSegs.join("/")}/?$`;
        }
        const dest = queryParts.length ? `/${relDir}?${queryParts.join("&")}` : `/${relDir}`;
        fnConfigRoutes.push({ src, dest });
        process.stdout.write(`  ${paint("cyan", "ƒ")} /${relDir} ${paint("yellow", `[${runtime}]`)}\n`);
      }
    }

    if (failCount > 0) {
      const tail = tailDevLog(30);
      if (tail.length) {
        process.stdout.write(`\n  ${paint("dim", "dev server tail:")}\n`);
        for (const line of tail) process.stdout.write(`    ${paint("dim", line)}\n`);
      }
    }

    const notFoundFile = findNotFoundFile(APP_DIR);
    if (notFoundFile) {
      try {
        const { status, body } = await fetchRoute("/_not_found_");
        if (status === 200 || status === 404) {
          const html = stripHmrScript(body).replace(/<title>[^<]*<\/title>/, "<title>404 · Swift Rust</title>");
          writeRawFile(STATIC_DIR, "404.html", html);
          process.stdout.write(`\n  ${paint("green", "✓")} 404.html\n`);
        }
      } catch (e) {
        process.stdout.write(`\n  ${paint("yellow", "!")} 404.html ${paint("dim", "fallback to minimal page")}\n`);
      }
    }
    if (!existsSync(join(STATIC_DIR, "404.html"))) {
      writeRawFile(STATIC_DIR, "404.html", `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><title>404 · Swift Rust</title></head>
<body><main style="font-family:system-ui;padding:4rem;text-align:center">
<h1>404</h1><p>This page could not be found.</p><a href="/">← Back home</a>
</main></body></html>`);
    }

    if (existsSync(RUNTIME_DIR)) {
      cpSync(RUNTIME_DIR, join(STATIC_DIR, "_swift-rust"), { recursive: true });
    }
    const hasPublic = existsSync(PUBLIC_DIR);
    if (hasPublic) {
      cpSync(PUBLIC_DIR, STATIC_DIR, { recursive: true });
      process.stdout.write(`  ${paint("green", "✓")} copied public/\n`);
    }

    // App-directory metadata icons (app/favicon.ico, app/icon.svg, …) → static root.
    // The <link> tags are already baked into the rendered HTML by the dev server.
    const APP_ICON_FILES = ["favicon.ico", "favicon.svg", "icon.svg", "icon.png", "apple-icon.png"];
    for (const name of APP_ICON_FILES) {
      const src = join(APP_DIR, name);
      if (existsSync(src)) {
        cpSync(src, join(STATIC_DIR, name));
        process.stdout.write(`  ${paint("green", "✓")} ${name}\n`);
      }
    }

    // Metadata route files: robots.ts/robots.js/robots.txt and sitemap.ts/sitemap.js/sitemap.xml
    const robotsFile = findRoutingFile(APP_DIR, "robots") || (existsSync(join(APP_DIR, "robots.txt")) ? join(APP_DIR, "robots.txt") : null);
    if (robotsFile) {
      if (robotsFile.endsWith(".txt")) {
        cpSync(robotsFile, join(STATIC_DIR, "robots.txt"));
        process.stdout.write(`  ${paint("green", "✓")} robots.txt\n`);
      } else {
        try {
          const mod = await import(`${robotsFile}?t=${Date.now()}`);
          const fn = mod.default ?? mod.robots;
          const data = typeof fn === "function" ? await fn() : (mod.default ?? mod.robots ?? mod);
          writeFileSync(join(STATIC_DIR, "robots.txt"), serializeRobots(data), "utf8");
          process.stdout.write(`  ${paint("green", "✓")} robots.txt\n`);
        } catch (e) {
          process.stdout.write(`  ${paint("yellow", "!")} robots.txt failed: ${e.message}\n`);
        }
      }
    }

    const sitemapFile = findRoutingFile(APP_DIR, "sitemap") || (existsSync(join(APP_DIR, "sitemap.xml")) ? join(APP_DIR, "sitemap.xml") : null);
    if (sitemapFile) {
      if (sitemapFile.endsWith(".xml")) {
        cpSync(sitemapFile, join(STATIC_DIR, "sitemap.xml"));
        process.stdout.write(`  ${paint("green", "✓")} sitemap.xml\n`);
      } else {
        try {
          const mod = await import(`${sitemapFile}?t=${Date.now()}`);
          const fn = mod.default ?? mod.sitemap;
          const data = typeof fn === "function" ? await fn() : (mod.default ?? mod.sitemap ?? mod);
          writeFileSync(join(STATIC_DIR, "sitemap.xml"), serializeSitemap(data), "utf8");
          process.stdout.write(`  ${paint("green", "✓")} sitemap.xml\n`);
        } catch (e) {
          process.stdout.write(`  ${paint("yellow", "!")} sitemap.xml failed: ${e.message}\n`);
        }
      }
    }

    // Client navigator runtime (SPA navigation). The rendered HTML references
    // /_swift-rust/navigator.js; emit it as a static asset so deployed sites
    // get client-side navigation too.
    const navSrc = join(RUNTIME_DIR, "navigator.js");
    if (existsSync(navSrc)) {
      writeRawFile(STATIC_DIR, "_swift-rust/navigator.js", readFileSync(navSrc));
      process.stdout.write(`  ${paint("green", "✓")} _swift-rust/navigator.js\n`);
    }

    // Bundled local fonts — the dev server serves these from
    // /_swift-rust/fonts/; emit them so deployed @font-face URLs resolve.
    const fontDir = resolveLocalFontDir();
    if (fontDir) {
      cpSync(fontDir, join(STATIC_DIR, "_swift-rust", "fonts"), { recursive: true });
      process.stdout.write(`  ${paint("green", "✓")} _swift-rust/fonts/\n`);
    }

    if (IS_VERCEL) {
      writeConfigJson(OUT_DIR, hasPublic, fnConfigRoutes);
    } else {
      await buildMultivrsServer(readFileSync(join(STATIC_DIR, "404.html"), "utf8"));
      process.stdout.write(`  ${paint("green", "✓")} ${MULTIVRS_BINARY} ${paint("dim", `(${serverRoutes.length} server route${serverRoutes.length === 1 ? "" : "s"})`)}\n`);
      const manifest = writeMultivrsManifest(staticWritten);
      process.stdout.write(`  ${paint("green", "✓")} ${MULTIVRS_MANIFEST} ${paint("dim", `(${manifest.routes.length} routes)`)}\n`);
    }

    const total = Date.now() - start;
    const outRel = OUT_DIR.startsWith(cwd + sep) ? OUT_DIR.slice(cwd.length + 1) : OUT_DIR;
    const skippedPart = skipCount > 0 ? paint("dim", `${skipCount} skipped`) : "";
    const failedPart = failCount > 0 ? paint("yellow", `${failCount} failed`) : paint("dim", "0 failed");
    const fnPart = fnCount > 0 ? `  ${paint("cyan", `${fnCount} function${fnCount === 1 ? "" : "s"}`)}` : "";
    const summary = `  ${paint("green", "✓")} ${okCount} ok  ${skippedPart}  ${failedPart}${fnPart}\n`;
    process.stdout.write(`\n  ${paint("bold", "done")} ${paint("dim", "in " + fmtMs(total))}\n`);
    process.stdout.write(summary);
    process.stdout.write(`  ${paint("dim", "output: " + outRel)}\n`);
    if (IS_VERCEL && usesBunFns) {
      ensureBunVersion();
    }
    if (!IS_VERCEL) {
      process.stdout.write(`  ${paint("dim", `run:    cd ${outRel} && PORT=8080 bun ${MULTIVRS_BINARY}`)}\n`);
    }
    process.stdout.write("\n");

    const treatFailuresAsWarning = okCount > 0;
    process.exitCode = treatFailuresAsWarning || failCount === 0 ? 0 : 1;
  } finally {
    try { proc.kill(process.platform === "win32" ? undefined : "SIGTERM"); } catch {}
    setTimeout(() => {
      try { proc.kill(process.platform === "win32" ? undefined : "SIGKILL"); } catch {}
      process.exit(process.exitCode ?? 0);
    }, 2000).unref();
  }
}

function diagnosticFromHtml(body) {
  const match = String(body || "").match(/<script type="application\/json" id="__sr_diagnostic">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function printBuildError(err, context) {
  const diagnostic = err?.diagnostic || diagnose(err, { cwd, context });
  process.stdout.write(`\n${renderTerminal(diagnostic, paint)}\n`);
}

main().catch((e) => {
  printBuildError(e, "while building");
  process.exit(1);
});
