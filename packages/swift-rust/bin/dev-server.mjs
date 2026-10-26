#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, statSync, readFileSync, readdirSync, writeFileSync, unlinkSync, watch as fsWatch } from "node:fs";
import { join, resolve, extname, relative, dirname, basename, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import {
  errorOverlayHTML as renderErrorOverlay,
  formatTerminalError,
  normalizeBuildError,
} from "./error-overlay.mjs";
import {
  diagnose,
  invalidRuntimeWarning,
  missingDefaultExportDiagnostic,
  noAppDirDiagnostic,
  notFoundDiagnostic,
  renderTerminal,
  routingFileWarning,
  serverActionNotFoundDiagnostic,
  serverInClientDiagnostic,
  staticCookieDiagnostic,
  toError,
  useStaticConflictDiagnostic,
} from "./diagnostics.mjs";
import {
  isSupportedBunVersion,
  unsupportedBunMessage,
} from "./runtime/bun-version.mjs";
import { FRAMEWORK_VERSION } from "./runtime/framework-version.mjs";
import { runWithRouteContext } from "./runtime/route-context.mjs";
import { actionExport, invokeApiRoute, parseActionRequest, runServerAction } from "./server-core.mjs";
import {
  isAbsoluteBuildPath,
  isLocalBuildSpecifier,
  shouldExternalizeBuildSpecifier,
} from "./runtime/path-specifier.mjs";

if (!isSupportedBunVersion(process.versions?.bun)) {
  process.stderr.write(`${unsupportedBunMessage(process.versions?.bun)}\n`);
  process.exit(1);
}

// Locate the bundled local fonts. Prefers the installed @swift-rust/font
// package (so it works when swift-rust is installed from npm), falling back to
// the monorepo source dir during local development.
let _localFontDir;
export function resolveLocalFontDir() {
  if (_localFontDir) return _localFontDir;
  const candidates = [];
  try {
    const req = createRequire(import.meta.url);
    const pkg = req.resolve("@swift-rust/font/package.json");
    candidates.push(join(dirname(pkg), "src", "local"), join(dirname(pkg), "dist", "local"));
  } catch {}
  candidates.push(join(import.meta.dirname, "..", "..", "..", "packages", "font", "src", "local"));
  _localFontDir = candidates.find((d) => existsSync(d)) ?? candidates[candidates.length - 1];
  return _localFontDir;
}

function resolveLocalFontPath(pathname) {
  const fontName = decodeURIComponent(pathname.replace("/_swift-rust/fonts/", ""));
  const fontDir = resolve(resolveLocalFontDir());
  const fontPath = resolve(fontDir, fontName);
  if (!fontName || !fontPath.startsWith(`${fontDir}${sep}`)) return null;
  return fontPath;
}

const cwd = process.cwd();
const args = process.argv.slice(2);

function getArg(name, fallback) {
  const flag = `--${name}`;
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const i = args.indexOf(flag);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return fallback;
}

let port = parseInt(getArg("port", process.env.PORT || "3210"), 10);
const hostname = getArg("hostname", "0.0.0.0");

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};
const useColor = process.stdout.isTTY !== false && !process.env.NO_COLOR;
const paint = (color, s) => (useColor ? `${c[color]}${s}${c.reset}` : s);

async function findFreePort(start) {
  const { createServer } = await import("node:net");
  const end = Math.min(start + 50, 65_536);
  for (let candidate = start; candidate < end; candidate++) {
    const available = await new Promise((resolveAvailable) => {
      const probe = createServer();
      probe.once("error", () => resolveAvailable(false));
      probe.once("listening", () => {
        probe.close(() => resolveAvailable(true));
      });
      probe.listen(candidate, hostname);
    });
    if (available) return candidate;
  }
  throw new Error(`No free port found between ${start} and ${end - 1}`);
}

const VERSION = FRAMEWORK_VERSION;
const APP_DIR_CANDIDATES = [resolve(cwd, "src", "app"), resolve(cwd, "app")];
const APP_DIR = APP_DIR_CANDIDATES.find((p) => existsSync(p)) ?? resolve(cwd, "app");
const PUBLIC_DIR = resolve(cwd, "public");
const SWIFT_RUST_CONFIG = resolve(cwd, "swift-rust.config.json");

const PAGE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];
const SPECIAL_FILES = new Set([
  "layout", "loading", "error", "not-found", "template", "default", "route",
  // RFC 0001 routing files
  "guard", "loader", "action", "config", "schema", "proxy", "pending",
  "revalidate", "shell", "fragment", "transition", "fallback", "prefetch",
  "error-recovery", "i18n", "rpc", "stream", "edge", "worker", "query",
  "state", "seo", "variant", "global-error",
]);

const moduleCache = new Map();
const compileTimings = new Map();
const lastCompiledAt = new Map();
const hmrClients = new Set();
let lastError = null;
const dynamicParams = new Map();

const startedAt = performance.now();
const bootTime = Date.now();

function fmtMs(ms) {
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function logLine(parts, indent = 0) {
  const prefix = `${"│ ".repeat(indent)}`;
  process.stdout.write(`${prefix}${parts.join("")}\n`);
}

function logStartupBanner(localUrl, networkUrls) {
  const lines = [];
  lines.push("");
  lines.push(`  ${paint("cyan", "▲")} ${paint("bold", "Swift Rust")} ${paint("dim", `v${VERSION}`)}`);
  lines.push(`  ${paint("dim", "─".repeat(50))}`);
  lines.push(`  ${paint("dim", "Local:".padEnd(10))} ${paint("cyan", localUrl)}`);
  for (const url of networkUrls) {
    lines.push(`  ${paint("dim", "Network:".padEnd(10))} ${paint("cyan", url)}`);
  }
  lines.push(`  ${paint("dim", "─".repeat(50))}`);
  lines.push("");
  process.stdout.write(lines.join("\n") + "\n");
}

function logReady() {
  const total = performance.now() - startedAt;
  logLine([` ${paint("green", "✓")} ${paint("bold", "Ready")} ${paint("dim", `in ${fmtMs(total)}`)}`]);
}

function logCompile(route, ms) {
  const safe = route || "/";
  logLine([` ${paint("green", "✓")} ${paint("dim", "Compiled")} ${paint("cyan", safe)} ${paint("dim", `in ${fmtMs(ms)}`)}`]);
}

function logCompiling(route) {
  const safe = route || "/";
  logLine([` ${paint("yellow", "○")} ${paint("dim", "Compiling")} ${paint("cyan", safe)} ${paint("dim", "…")}`]);
}

function logError(err, context, extra) {
  const { formatted, diagnostic } = formatTerminalError(err, context || null, cwd, paint, extra);
  process.stdout.write(`\n${formatted}\n\n`);
  return diagnostic;
}

function logDiagnostic(diagnostic) {
  process.stdout.write(`\n${renderTerminal(diagnostic, paint)}\n\n`);
  return diagnostic;
}

// Outstanding problems surfaced in the dev toolbar's Issues panel. Keyed so a
// later success for the same source (route, island, file) clears its entry.
const devIssues = new Map();
function setIssue(key, diagnostic) {
  devIssues.set(key, diagnostic);
}
function clearIssue(key) {
  devIssues.delete(key);
}
function clearIssuesWithPrefix(prefix) {
  for (const key of devIssues.keys()) if (key.startsWith(prefix)) devIssues.delete(key);
}

function logRequest({ method, url, status, duration, compileMs }) {
  const statusColor = status < 300 ? "green" : status < 400 ? "cyan" : status < 500 ? "yellow" : "red";
  const timing = compileMs > 0 ? ` ${paint("dim", `(${fmtMs(compileMs)} compile, ${fmtMs(duration - compileMs)} render)`)}` : "";
  logLine([
    `${paint("bold", method.padEnd(6))} `,
    `${paint("dim", url)} `,
    `${paint(statusColor, String(status))} `,
    `${paint("dim", `in ${fmtMs(duration)}`)}`,
    timing,
  ]);
}

function logHmr(file) {
  logLine([` ${paint("magenta", "↻")} ${paint("dim", "HMR")} ${paint("dim", "│")} ${paint("magenta", relative(cwd, file))}`]);
}

function logEvent(type, msg) {
  const colors = { add: "green", change: "yellow", unlink: "red" };
  const icons = { add: "+", change: "~", unlink: "-" };
  logLine([` ${paint(colors[type] || "dim", icons[type] || "?")} ${paint("dim", relative(cwd, msg))}`]);
}

function urlToRouteSegments(urlPath) {
  const clean = urlPath.split("?")[0].split("#")[0];
  if (clean === "/" || clean === "") return [];
  return clean.replace(/^\//, "").split("/").filter(Boolean);
}

function findFile(dir, basename) {
  for (const ext of PAGE_EXTENSIONS) {
    const candidate = join(dir, `${basename}${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const OPT_CATCH_PARAM = /^\[\[\.{3}([^\]]+)\]\]$/;
const CATCH_PARAM = /^\[\.{3}([^\]]+)\]$/;
const NAMED_PARAM = /^\[([^\]]+)\]$/;

function isPrivateDir(name) {
  return name.startsWith("_");
}

function parseInterceptSegment(name) {
  if (name.startsWith("(.)")) {
    return { kind: "same", levelsUp: 0, firstSeg: name.slice(3) };
  }
  if (name.startsWith("(...)")) {
    return { kind: "root", levelsUp: Infinity, firstSeg: name.slice(5) };
  }
  const m = name.match(/^((?:\(\.\.\))+)(.+)$/);
  if (m) {
    const levelsUp = m[1].length / 4;
    return { kind: "up", levelsUp, firstSeg: m[2] };
  }
  return null;
}

function matchPatternSegments(pattern, segments) {
  const params = {};
  let pi = 0;
  let si = 0;
  while (pi < pattern.length && si < segments.length) {
    const p = pattern[pi];
    const s = segments[si];
    if (p.startsWith("[[...") && p.endsWith("]]")) {
      params[p.slice(5, -2)] = segments.slice(si);
      return { matched: true, params };
    }
    if (p.startsWith("[...") && p.endsWith("]")) {
      params[p.slice(4, -1)] = segments.slice(si);
      return { matched: true, params };
    }
    if (p.startsWith("[") && p.endsWith("]")) {
      params[p.slice(1, -1)] = s;
      pi++;
      si++;
      continue;
    }
    if (p !== s) return { matched: false };
    pi++;
    si++;
  }
  if (pi === pattern.length && si === segments.length) {
    return { matched: true, params };
  }
  if (pi === pattern.length - 1 && pattern[pi].startsWith("[[...") && pattern[pi].endsWith("]]") && si === segments.length) {
    params[pattern[pi].slice(5, -2)] = undefined;
    return { matched: true, params };
  }
  return { matched: false };
}

function findInterceptingRoutes(root = APP_DIR) {
  const list = [];
  function walk(currentDir) {
    if (!existsSync(currentDir) || !statSync(currentDir).isDirectory()) return;
    let entries;
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (isPrivateDir(e.name) || e.name.startsWith(".") || e.name === "node_modules") continue;
      const intercept = parseInterceptSegment(e.name);
      if (intercept) {
        let slotName = null;
        let ownerDir = currentDir;
        if (basename(currentDir).startsWith("@")) {
          slotName = basename(currentDir).slice(1);
          ownerDir = dirname(currentDir);
        }
        const rel = relative(APP_DIR, ownerDir);
        const declaringSegments = (rel === "" || rel === ".")
          ? []
          : rel.split(sep).filter((s) => !s.startsWith("@") && !/^\(.*\)$/.test(s));
        let baseSegments;
        if (intercept.kind === "root") {
          baseSegments = [];
        } else if (intercept.kind === "same") {
          baseSegments = declaringSegments;
        } else {
          baseSegments = declaringSegments.slice(0, Math.max(0, declaringSegments.length - intercept.levelsUp));
        }

        const interceptDir = join(currentDir, e.name);
        function findPagesInIntercept(dir, childSegs, chain) {
          const page = findFile(dir, "page");
          if (page) {
            list.push({
              patternSegments: [...baseSegments, intercept.firstSeg, ...childSegs],
              ownerDir,
              slotName,
              pageFile: page,
              dirChain: chain,
            });
          }
          let childEntries;
          try {
            childEntries = readdirSync(dir, { withFileTypes: true });
          } catch {
            return;
          }
          for (const ce of childEntries) {
            if (!ce.isDirectory() || ce.name.startsWith(".") || isPrivateDir(ce.name)) continue;
            findPagesInIntercept(join(dir, ce.name), [...childSegs, ce.name], [...chain, join(dir, ce.name)]);
          }
        }
        findPagesInIntercept(interceptDir, [], [APP_DIR, ...(ownerDir !== APP_DIR ? [ownerDir] : []), interceptDir]);
      } else {
        walk(join(currentDir, e.name));
      }
    }
  }
  walk(root);
  return list;
}

function resolvePageRoute(segments) {
  return resolveRoute(APP_DIR, segments, 0, {}, [APP_DIR]);
}

function resolveRoute(dir, segments, idx, params, chain) {
  if (idx === segments.length) {
    const file = findFile(dir, "page");
    if (file) return { file, params, segments: segments.slice(0, idx), dirChain: chain };
    if (existsSync(dir) && statSync(dir).isDirectory()) {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (!e.isDirectory() || isPrivateDir(e.name) || e.name.startsWith(".") || e.name.startsWith("@")) continue;
        const m = e.name.match(OPT_CATCH_PARAM);
        if (m) {
          const optDir = join(dir, e.name);
          const optFile = findFile(optDir, "page");
          if (optFile) {
            return {
              file: optFile,
              params: { ...params, [m[1]]: undefined },
              segments: segments.slice(0, idx),
              dirChain: [...chain, optDir],
            };
          }
        }
      }
    }
    return null;
  }
  const seg = segments[idx];
  let directDir = null;
  if (seg.startsWith("_")) {
    const enc1 = join(dir, "%5F" + seg.slice(1));
    const enc2 = join(dir, "%5f" + seg.slice(1));
    if (existsSync(enc1) && statSync(enc1).isDirectory()) directDir = enc1;
    else if (existsSync(enc2) && statSync(enc2).isDirectory()) directDir = enc2;
  } else {
    const candidate = join(dir, seg);
    if (!isPrivateDir(seg) && existsSync(candidate) && statSync(candidate).isDirectory()) {
      directDir = candidate;
    }
  }
  if (directDir) {
    const result = resolveRoute(directDir, segments, idx + 1, params, [...chain, directDir]);
    if (result) return result;
  }
  if (existsSync(dir) && statSync(dir).isDirectory()) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || isPrivateDir(e.name) || e.name.startsWith(".") || e.name.startsWith("@")) continue;
      if (e.name.startsWith("(.)") || e.name.startsWith("(..)") || e.name.startsWith("(...)")) continue;
      const named = e.name.match(NAMED_PARAM);
      if (named && !named[1].startsWith("...") && !named[1].startsWith("[")) {
        const paramDir = join(dir, e.name);
        const newParams = { ...params, [named[1]]: seg };
        const result = resolveRoute(paramDir, segments, idx + 1, newParams, [...chain, paramDir]);
        if (result) return result;
      }
    }
    for (const e of entries) {
      if (!e.isDirectory() || isPrivateDir(e.name) || e.name.startsWith(".") || e.name.startsWith("@")) continue;
      if (e.name.startsWith("(.)") || e.name.startsWith("(..)") || e.name.startsWith("(...)")) continue;
      const m = e.name.match(CATCH_PARAM);
      if (m) {
        const catchDir = join(dir, e.name);
        const file = findFile(catchDir, "page");
        if (file) {
          return {
            file,
            params: { ...params, [m[1]]: segments.slice(idx) },
            segments,
            dirChain: [...chain, catchDir],
          };
        }
      }
    }
    for (const e of entries) {
      if (!e.isDirectory() || isPrivateDir(e.name) || e.name.startsWith(".") || e.name.startsWith("@")) continue;
      if (e.name.startsWith("(.)") || e.name.startsWith("(..)") || e.name.startsWith("(...)")) continue;
      const m = e.name.match(OPT_CATCH_PARAM);
      if (m) {
        const optDir = join(dir, e.name);
        const file = findFile(optDir, "page");
        if (file) {
          return {
            file,
            params: { ...params, [m[1]]: segments.slice(idx) },
            segments,
            dirChain: [...chain, optDir],
          };
        }
      }
    }
  }
  return null;
}

/** Resolve the leaf directory for URL segments (incl. dynamic), even when the
 *  segment has no page.tsx — used for stream.ts / rpc.ts handlers. */
function resolveLeafDir(segments) {
  return walkLeafDir(APP_DIR, segments, 0, {});
}
function walkLeafDir(dir, segments, idx, params) {
  if (idx === segments.length) return { dir, params };
  const seg = segments[idx];
  let directDir = null;
  if (seg.startsWith("_")) {
    const enc1 = join(dir, "%5F" + seg.slice(1));
    const enc2 = join(dir, "%5f" + seg.slice(1));
    if (existsSync(enc1) && statSync(enc1).isDirectory()) directDir = enc1;
    else if (existsSync(enc2) && statSync(enc2).isDirectory()) directDir = enc2;
  } else {
    const candidate = join(dir, seg);
    if (!isPrivateDir(seg) && existsSync(candidate) && statSync(candidate).isDirectory()) {
      directDir = candidate;
    }
  }
  if (directDir) {
    const r = walkLeafDir(directDir, segments, idx + 1, params);
    if (r) return r;
  }
  if (existsSync(dir) && statSync(dir).isDirectory()) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || isPrivateDir(e.name) || e.name.startsWith(".") || e.name.startsWith("@")) continue;
      const named = e.name.match(NAMED_PARAM);
      if (named && !named[1].startsWith("...") && !named[1].startsWith("[")) {
        const r = walkLeafDir(join(dir, e.name), segments, idx + 1, { ...params, [named[1]]: seg });
        if (r) return r;
      }
    }
    for (const e of entries) {
      if (!e.isDirectory() || isPrivateDir(e.name) || e.name.startsWith(".") || e.name.startsWith("@")) continue;
      const m = e.name.match(CATCH_PARAM);
      if (m) return { dir: join(dir, e.name), params: { ...params, [m[1]]: segments.slice(idx) } };
    }
    for (const e of entries) {
      if (!e.isDirectory() || isPrivateDir(e.name) || e.name.startsWith(".") || e.name.startsWith("@")) continue;
      const m = e.name.match(OPT_CATCH_PARAM);
      if (m) return { dir: join(dir, e.name), params: { ...params, [m[1]]: segments.slice(idx) } };
    }
  }
  return null;
}

/** Collect a routing file (guard/loader/action/config/schema/…) along the
 *  matched directory chain, outermost → innermost. */
function collectRouteFiles(dirChain, basename) {
  const out = [];
  for (const dir of dirChain || []) {
    const f = findFile(dir, basename);
    if (f) out.push({ file: f, dir });
  }
  return out;
}

function resolveApiRoute(segments) {
  if (segments.length === 0 || segments[0] !== "api") return null;
  const apiDir = join(APP_DIR, "api");
  if (!existsSync(apiDir)) return null;
  return resolveApi(apiDir, segments.slice(1), 0, {});
}

function resolveApi(dir, segments, idx, params) {
  if (idx === segments.length) {
    const file = findFile(dir, "route");
    if (file) return { file, params };
    if (existsSync(dir) && statSync(dir).isDirectory()) {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (!e.isDirectory() || isPrivateDir(e.name) || e.name.startsWith(".") || e.name.startsWith("@")) continue;
        const m = e.name.match(OPT_CATCH_PARAM);
        if (m) {
          const optDir = join(dir, e.name);
          const optFile = findFile(optDir, "route");
          if (optFile) return { file: optFile, params: { ...params, [m[1]]: undefined } };
        }
      }
    }
    return null;
  }
  const seg = segments[idx];
  let directDir = null;
  if (seg.startsWith("_")) {
    const enc1 = join(dir, "%5F" + seg.slice(1));
    const enc2 = join(dir, "%5f" + seg.slice(1));
    if (existsSync(enc1) && statSync(enc1).isDirectory()) directDir = enc1;
    else if (existsSync(enc2) && statSync(enc2).isDirectory()) directDir = enc2;
  } else {
    const candidate = join(dir, seg);
    if (!isPrivateDir(seg) && existsSync(candidate) && statSync(candidate).isDirectory()) {
      directDir = candidate;
    }
  }
  if (directDir) {
    const result = resolveApi(directDir, segments, idx + 1, params);
    if (result) return result;
  }
  if (existsSync(dir) && statSync(dir).isDirectory()) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || isPrivateDir(e.name) || e.name.startsWith(".") || e.name.startsWith("@")) continue;
      const named = e.name.match(NAMED_PARAM);
      if (named && !named[1].startsWith("...") && !named[1].startsWith("[")) {
        const paramDir = join(dir, e.name);
        const newParams = { ...params, [named[1]]: seg };
        const result = resolveApi(paramDir, segments, idx + 1, newParams);
        if (result) return result;
      }
    }
    for (const e of entries) {
      if (!e.isDirectory() || isPrivateDir(e.name) || e.name.startsWith(".") || e.name.startsWith("@")) continue;
      const m = e.name.match(CATCH_PARAM);
      if (m) {
        const file = findFile(join(dir, e.name), "route");
        if (file) return { file, params: { ...params, [m[1]]: segments.slice(idx) } };
      }
    }
    for (const e of entries) {
      if (!e.isDirectory() || isPrivateDir(e.name) || e.name.startsWith(".") || e.name.startsWith("@")) continue;
      const m = e.name.match(OPT_CATCH_PARAM);
      if (m) {
        const file = findFile(join(dir, e.name), "route");
        if (file) return { file, params: { ...params, [m[1]]: segments.slice(idx) } };
      }
    }
  }
  return null;
}

function findLayoutsFor(segments, dirChain) {
  const layouts = [];
  if (dirChain && dirChain.length > 0) {
    for (const dir of dirChain) {
      const file = findFile(dir, "layout");
      if (file && !layouts.some((l) => l.file === file)) layouts.push({ file, dir });
    }
    return layouts;
  }
  for (let i = 0; i <= segments.length; i++) {
    const dir = i === 0 ? APP_DIR : join(APP_DIR, ...segments.slice(0, i));
    const file = findFile(dir, "layout");
    if (file) layouts.push({ file, dir });
  }
  return layouts;
}

function findNotFound(segments) {
  for (let i = segments?.length ?? 0; i >= 0; i--) {
    const dir = i === 0 ? APP_DIR : join(APP_DIR, ...segments.slice(0, i));
    const file = findFile(dir, "not-found");
    if (file) return file;
  }
  return findFile(APP_DIR, "not-found");
}

function findErrorBoundary(segments) {
  for (let i = segments?.length ?? 0; i >= 0; i--) {
    const dir = i === 0 ? APP_DIR : join(APP_DIR, ...segments.slice(0, i));
    const file = findFile(dir, "error");
    if (file) return file;
  }
  return findFile(APP_DIR, "error");
}

function findLoading(segments) {
  for (let i = segments?.length ?? 0; i >= 0; i--) {
    const dir = i === 0 ? APP_DIR : join(APP_DIR, ...segments.slice(0, i));
    const file = findFile(dir, "loading");
    if (file) return file;
  }
  return findFile(APP_DIR, "loading");
}

/** Generic: find the nearest `<basename>` file walking the URL segments up. */
function findRouteFileUp(segments, basename) {
  for (let i = segments?.length ?? 0; i >= 0; i--) {
    const dir = i === 0 ? APP_DIR : join(APP_DIR, ...segments.slice(0, i));
    const file = findFile(dir, basename);
    if (file) return file;
  }
  return findFile(APP_DIR, basename);
}

function findRouteSegmentsForDir(dir) {
  const rel = relative(APP_DIR, dir);
  if (rel === "" || rel === ".") return [];
  return rel.split(sep);
}

function bustCache(file) {
  const urlPrefix = pathToFileURL(file).href;
  for (const key of moduleCache.keys()) {
    if (key === urlPrefix || key.startsWith(`${urlPrefix}?`) || key.startsWith(`${urlPrefix}#`)) {
      moduleCache.delete(key);
    }
  }
}

// Bumped on every file change. Used to invalidate the per-render SSR bundles
// below so that edits to *transitively imported* modules (components/, lib/)
// are picked up — Bun's module cache is path-keyed and ignores ?query busting,
// so a plain re-import of the page would still serve stale child modules.
let buildGeneration = 1;

// Externalize everything that isn't the app's own source (relative imports and
// the @/ alias). React and the framework stay shared/cached; only app code is
// re-bundled, so every render reflects the latest component/lib edits.
const externalizeDepsPlugin = {
  name: "sr-externalize-deps",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      const p = args.path;
      if (!shouldExternalizeBuildSpecifier(p, args.kind)) return undefined;
      return { path: p, external: true };
    });
  },
};

// ── Component-level "use client" islands ───────────────────────────────────
// A `use client` *component* imported into a server-rendered page can't just be
// SSR'd to static HTML — its useState/effects/handlers would never run. So when
// the SSR bundle pulls in a client component, we wrap it: on the server it still
// renders to HTML (good for SEO + no flash), but inside a marker element that
// carries the component's source path, export name, and serialized props. A tiny
// client runtime then hydrates each marker from a per-component browser bundle.
//
// Limitations (documented): props must be JSON-serializable; `children` and
// function props don't cross the boundary, so islands should be self-contained
// leaves (they manage their own children). Nested client components imported by
// a client component are bundled into that island, not re-wrapped.

const ISLAND_EXTS = [".tsx", ".ts", ".jsx", ".js", ".mjs"];

// Resolve a relative / absolute / "@/"-aliased specifier to a real file path.
function resolveIslandSpecifier(spec, importer) {
  let base;
  if (spec.startsWith("@/")) base = resolve(cwd, "src", spec.slice(2));
  else if (isAbsoluteBuildPath(spec)) base = spec;
  else if (spec.startsWith(".")) base = resolve(dirname(importer || cwd), spec);
  else return null;
  const candidates = [base, ...ISLAND_EXTS.map((e) => base + e), ...ISLAND_EXTS.map((e) => join(base, "index" + e))];
  for (const c of candidates) {
    try { if (statSync(c).isFile()) return c; } catch {}
  }
  return null;
}

// Extract export names from a module's source so we can re-export wrapped
// versions. We only wrap Capitalized exports (React component convention) + the
// default export; lowercase exports pass through untouched.
function detectIslandExports(src) {
  const named = new Set();
  let hasDefault = false;
  // strip block/line comments cheaply to avoid false matches
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

// Build the source of an island wrapper module for a given client component
// file. Temp sibling files hold verbatim copies of client components, so the
// wrapper can import the *real* module under a distinct on-disk path (Bun
// dedupes modules by resolved path, so a query-string alias would collapse the
// real module into the wrapper). `temps` is per-build: a shared global list
// let concurrent builds delete each other's temp files mid-build, which
// surfaced as transient module-not-found errors on save.
function islandWrapperSource(abs, temps) {
  const src = readFileSync(abs, "utf8");
  const { hasDefault, named } = detectIslandExports(src);
  // Write the real component to a unique sibling so imports resolve identically.
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

// Which exported names of a 'use cache' module are *async functions* (the only
// ones safe to wrap with cache(), since cache() always returns a Promise). We
// pass everything else through untouched.
function detectAsyncExports(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const asyncNamed = new Set();
  const allNamed = new Set();
  let defaultAsync = false;
  let hasDefault = false;
  if (/\bexport\s+default\b/.test(code)) {
    hasDefault = true;
    if (/\bexport\s+default\s+async\b/.test(code)) defaultAsync = true;
  }
  for (const m of code.matchAll(/\bexport\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) {
    allNamed.add(m[2]);
    if (m[1]) asyncNamed.add(m[2]);
  }
  for (const m of code.matchAll(/\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(async\b)?/g)) {
    allNamed.add(m[1]);
    if (m[2]) asyncNamed.add(m[1]);
  }
  for (const m of code.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && name !== "default") allNamed.add(name);
    }
  }
  return { asyncNamed: [...asyncNamed], allNamed: [...allNamed], defaultAsync, hasDefault };
}

// Source of a wrapper module that memoizes a 'use cache' module's async exports.
function cacheWrapperSource(abs, temps) {
  const src = readFileSync(abs, "utf8");
  const { asyncNamed, allNamed, defaultAsync, hasDefault } = detectAsyncExports(src);
  const rawName = `.__sr_raw_${process.pid}_${Math.random().toString(36).slice(2)}__${basename(abs)}`;
  const rawPath = join(dirname(abs), rawName);
  writeFileSync(rawPath, src);
  temps.push(rawPath);
  const tag = relative(cwd, abs);
  let out = `import { cache as __cache } from "swift-rust/cache";
import * as __real from ${JSON.stringify(rawPath)};
const __opts = { tags: ${JSON.stringify([tag])} };
`;
  if (hasDefault) {
    out += defaultAsync
      ? `export default __cache(__real.default, __opts);\n`
      : `export default __real.default;\n`;
  }
  for (const n of allNamed) {
    out += asyncNamed.includes(n)
      ? `export const ${n} = __cache(__real[${JSON.stringify(n)}], __opts);\n`
      : `export const ${n} = __real[${JSON.stringify(n)}];\n`;
  }
  return out;
}

// Bun plugin: auto-memoize modules that declare a leading 'use cache' directive.
// Built per-build so each build owns its temp-file list (see islandWrapperSource).
function makeUseCachePlugin(temps) {
  return {
    name: "sr-use-cache",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        const p = args.path;
        if (!isLocalBuildSpecifier(p)) return undefined;
        // Our own raw temp copy: resolve it explicitly into the file namespace.
        // (Deferring to Bun's default resolver fails from a virtual namespace.)
        if (/\.__sr_raw_/.test(p)) return { path: p, namespace: "file" };
        if (args.importer && hasUseDirective(args.importer, "cache")) return undefined;
        const abs = resolveIslandSpecifier(p, args.importer);
        if (!abs || !hasUseDirective(abs, "cache")) return undefined;
        return { path: abs, namespace: "sr-cache" };
      });
      build.onLoad({ filter: /.*/, namespace: "sr-cache" }, (args) => ({
        contents: cacheWrapperSource(args.path, temps),
        loader: "js",
        resolveDir: dirname(args.path),
      }));
    },
  };
}

// Bun plugin: wrap client components imported by *server* modules as islands.
function makeClientIslandPlugin(temps, entryFile) {
  return {
    name: "sr-client-islands",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (!args.importer || args.kind === "entry-point") return undefined;
        const p = args.path;
        if (!isLocalBuildSpecifier(p)) return undefined;
        // Never wrap our own temp raw copies, and don't wrap when the importer is
        // itself a client module — nested client components belong to that
        // island's bundle, not a new boundary.
        if (/\.__sr_raw_/.test(p)) return { path: p, namespace: "file" };
        if (args.importer && hasUseDirective(args.importer, "client")) return undefined;
        const abs = resolveIslandSpecifier(p, args.importer);
        if (!abs || abs === entryFile || !hasUseDirective(abs, "client")) return undefined;
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

function isUserActionFile(filePath) {
  const rel = relative(cwd, filePath);
  if (!rel || rel.startsWith("..") || rel.includes("node_modules") || rel.startsWith(`packages${sep}`)) {
    return false;
  }
  return hasServerDirective(filePath) || /(?:^|[\\/])actions?\.(ts|js|mjs|tsx)$/.test(filePath);
}

function makeServerActionClientPlugin() {
  return {
    name: "sr-server-action-client",
    setup(build) {
      build.onLoad({ filter: /\.(ts|js|mjs|tsx|jsx)$/ }, (args) => {
        try {
          if (!isUserActionFile(args.path)) return undefined;
          const src = readFileSync(args.path, "utf8");
          if (/<[a-zA-Z_][\w.-]*(\s|>|\/)|React\.createElement\s*\(|_jsx(?:s|DEV)?\s*\(/.test(src)) return undefined;
          const rel = relative(cwd, args.path);
          const exports = [];
          for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/g)) {
            exports.push(m[1]);
          }
          for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([a-zA-Z0-9_$]+)/g)) {
            exports.push(m[1]);
          }
          let code = `import { createServerAction } from "swift-rust/action";\n`;
          for (const exp of exports) {
            code += `export const ${exp} = createServerAction(${JSON.stringify(`${rel}#${exp}`)});\n`;
          }
          return { contents: code, loader: "js" };
        } catch {
          return undefined;
        }
      });
    },
  };
}

function makeServerActionServerPlugin() {
  return {
    name: "sr-server-action-server",
    setup(build) {
      build.onLoad({ filter: /\.(ts|js|mjs|tsx|jsx)$/ }, (args) => {
        try {
          if (!isUserActionFile(args.path)) return undefined;
          const src = readFileSync(args.path, "utf8");
          if (/<[a-zA-Z_][\w.-]*(\s|>|\/)|React\.createElement\s*\(|_jsx(?:s|DEV)?\s*\(/.test(src)) return undefined;
          const rel = relative(cwd, args.path);
          const exports = [];
          for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/g)) {
            exports.push(m[1]);
          }
          for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([a-zA-Z0-9_$]+)/g)) {
            exports.push(m[1]);
          }
          let code = src + "\n";
          for (const exp of exports) {
            code += `try { if (typeof ${exp} === "function") { ${exp}.$$actionId = ${JSON.stringify(`${rel}#${exp}`)}; } } catch (e) {}\n`;
          }
          const ext = extname(args.path).slice(1);
          return { contents: code, loader: ext === "ts" || ext === "tsx" ? ext : "js" };
        } catch {
          return undefined;
        }
      });
    },
  };
}

// In-flight build dedup: concurrent requests for the same entry (every open tab
// reloads at once on an HMR broadcast) await one build instead of racing.
function withInflight(map, key, gen, factory) {
  const cur = map.get(key);
  if (cur && cur.gen === gen) return cur.promise;
  const entry = { gen, promise: null };
  entry.promise = (async () => {
    try {
      return await factory();
    } finally {
      if (map.get(key) === entry) map.delete(key);
    }
  })();
  map.set(key, entry);
  return entry.promise;
}

// Cache for per-component browser island bundles (src -> { gen, code }).
// Each bundle is self-mounting: it imports the client component, finds every
// marker on the page for this source, and hydrates it. React is bundled in, so a
// single <script type="module"> per source needs no import map or shared runtime.
const componentIslandCache = new Map();
const componentIslandInflight = new Map();
async function buildComponentIslandBundle(srcFile) {
  if (typeof Bun === "undefined" || typeof Bun.build !== "function") {
    throw new Error("client islands require the Bun runtime");
  }
  const cached = componentIslandCache.get(srcFile);
  if (cached && cached.gen === buildGeneration) return cached.code;
  return withInflight(componentIslandInflight, srcFile, buildGeneration, () =>
    buildComponentIslandBundleNow(srcFile),
  );
}
async function buildComponentIslandBundleNow(srcFile) {
  const entryPath = join(
    dirname(srcFile),
    `.__sr_cisland_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}.js`,
  );
  const entry = `import { hydrateRoot, createRoot } from "react-dom/client";
import { createElement } from "react";
import * as __mod from ${JSON.stringify(srcFile)};
var __src = ${JSON.stringify(srcFile)};
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
    let result;
    try {
      result = await Bun.build({
        entrypoints: [entryPath],
        target: "browser",
        minify: true,
        plugins: [makeServerActionClientPlugin()],
        define: { "process.env.NODE_ENV": '"production"' },
      });
    } catch (buildErr) {
      throw normalizeBuildError(buildErr, [], cwd);
    }
    if (!result.success) throw normalizeBuildError(null, result.logs, cwd);
    const code = await result.outputs[0].text();
    componentIslandCache.set(srcFile, { gen: buildGeneration, code });
    return code;
  } finally {
    try { unlinkSync(entryPath); } catch {}
  }
}

// Collect unique client-island source files referenced in rendered HTML.
function collectIslandSources(html) {
  const srcs = new Set();
  if (!html) return srcs;
  for (const m of html.matchAll(/data-sr-island-src="([^"]+)"/g)) {
    srcs.add(m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"'));
  }
  return srcs;
}

const ssrBundleCache = new Map(); // file -> { gen, mod }
const ssrInflight = new Map(); // file -> { gen, promise }

async function loadModuleFresh(filePath) {
  if (typeof Bun === "undefined" || typeof Bun.build !== "function") {
    return loadModule(filePath, { bust: true });
  }
  const cached = ssrBundleCache.get(filePath);
  if (cached && cached.gen === buildGeneration) return cached.mod;
  return withInflight(ssrInflight, filePath, buildGeneration, () =>
    buildSsrModule(filePath, buildGeneration),
  );
}

async function buildSsrModule(filePath, gen) {
  const temps = [];
  let result;
  try {
    try {
      result = await Bun.build({
        entrypoints: [filePath],
        target: "bun",
        sourcemap: "inline",
        plugins: [
          makeUseCachePlugin(temps),
          makeClientIslandPlugin(temps, filePath),
          makeServerActionServerPlugin(),
          externalizeDepsPlugin,
        ],
      });
    } catch (buildErr) {
      throw normalizeBuildError(buildErr, [], cwd);
    }
  } finally {
    for (const t of temps) { try { unlinkSync(t); } catch {} }
  }
  if (!result.success) {
    throw normalizeBuildError(null, result.logs, cwd);
  }
  const output = result.outputs[0];
  if (!output) {
    throw new Error(
      `Bun.build produced no SSR output for ${relative(cwd, filePath)}. ` +
        "The application entry point may have been externalized.",
    );
  }
  const code = await output.text();
  const tmp = join(dirname(filePath), `.__sr_ssr_${gen}_${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, code);
  try {
    const mod = await import(pathToFileURL(tmp).href);
    if (isUserActionFile(filePath)) {
      const rel = relative(cwd, filePath);
      for (const [k, v] of Object.entries(mod)) {
        if (typeof v === "function") {
          v.$$actionId = `${rel}#${k}`;
        }
      }
    }
    ssrBundleCache.set(filePath, { gen, mod });
    return mod;
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

async function loadModule(filePath, { bust = false } = {}) {
  const baseUrl = pathToFileURL(filePath).href;
  const url = bust ? `${baseUrl}?t=${Date.now()}-${Math.random().toString(36).slice(2)}` : baseUrl;
  try {
    const mod = await import(url);
    if (isUserActionFile(filePath)) {
      const rel = relative(cwd, filePath);
      for (const [k, v] of Object.entries(mod)) {
        if (typeof v === "function") {
          v.$$actionId = `${rel}#${k}`;
        }
      }
    }
    moduleCache.set(url, { mod, file: filePath, loadedAt: Date.now() });
    return mod;
  } catch (err) {
    lastError = err;
    throw err;
  }
}

async function compileRoute(urlPath, req) {
  const start = performance.now();
  const segments = urlToRouteSegments(urlPath);
  const isSoftNav = Boolean(req && (req.headers?.get?.("x-swift-rust-nav") === "1" || req.headers?.get?.("x-swift-rust-from")));
  let route = null;
  let activeIntercept = null;
  if (isSoftNav) {
    const fromHeader = req.headers?.get?.("x-swift-rust-from") || (req.headers?.get?.("referer") ? new URL(req.headers.get("referer")).pathname : null);
    const fromSegments = fromHeader ? urlToRouteSegments(fromHeader) : null;
    const allIntercepts = findInterceptingRoutes(APP_DIR);
    for (const intercept of allIntercepts) {
      const match = matchPatternSegments(intercept.patternSegments, segments);
      if (match.matched) {
        if (intercept.slotName) {
          activeIntercept = { ...intercept, params: match.params };
          const bgSegments = fromSegments || findRouteSegmentsForDir(intercept.ownerDir);
          route = resolvePageRoute(bgSegments) || resolvePageRoute([]);
          if (route) route.params = { ...route.params, ...match.params };
          break;
        } else {
          route = { file: intercept.pageFile, params: match.params, segments, dirChain: intercept.dirChain };
          break;
        }
      }
    }
  }
  if (!route) {
    route = resolvePageRoute(segments);
  }
  if (!route) {
    compileTimings.set(urlPath, performance.now() - start);
    return { ok: false, reason: "not_found", pageFile: null, layoutFile: null, params: {}, segments };
  }
  const layouts = findLayoutsFor(segments, route.dirChain);
  const notFoundFile = findNotFound(segments);
  const errorFile = findErrorBoundary(segments);
  const loadingFile = findLoading(segments);

  if (lastCompiledAt.has(urlPath) && Date.now() - (lastCompiledAt.get(urlPath) || 0) < 100) {
    return { ok: true, pageFile: route.file, layoutFiles: layouts.map((l) => l.file), notFoundFile, errorFile, loadingFile, params: route.params, segments, cached: true };
  }

  try {
    // Generation-keyed bundles: a save bumps the generation (fresh build), an
    // unchanged file is a cache hit. The old `?t=` bust-imports created new
    // module instances on every request — they leaked (ESM registry entries
    // are permanent) and, under Bun, didn't even pick up child-module edits.
    await loadModuleFresh(route.file);
    if (activeIntercept) await loadModuleFresh(activeIntercept.pageFile);
    for (const layout of layouts) await loadModuleFresh(layout.file);
    if (notFoundFile) await loadModuleFresh(notFoundFile);
    if (errorFile) await loadModuleFresh(errorFile);
    if (loadingFile) await loadModuleFresh(loadingFile);
  } catch (err) {
    compileTimings.set(urlPath, performance.now() - start);
    return { ok: false, reason: "compile_error", error: err, pageFile: route.file, layoutFile: layouts[0]?.file, params: route.params, segments };
  }

  const ms = performance.now() - start;
  compileTimings.set(urlPath, ms);
  lastCompiledAt.set(urlPath, Date.now());
  return { ok: true, pageFile: route.file, layoutFiles: layouts.map((l) => l.file), notFoundFile, errorFile, loadingFile, params: route.params, segments };
}

function escapeForStyleTag(css) {
  return String(css).replace(/<\/style/gi, "<\\/style").replace(/<!--/g, "<\\!--");
}

function findAppGlobalsCss() {
  for (const ext of [".css", ".scss", ".pcss"]) {
    const candidate = join(APP_DIR, `globals${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

// A require() rooted at the user's project, so Node module resolution walks the
// real node_modules tree (project → monorepo root → …) and finds packages
// wherever the package manager hoisted them. Critical for production builds
// (e.g. Vercel), where hard-coded ../../node_modules guesses miss the plugin
// and Tailwind silently doesn't compile — shipping an unstyled site.
let _projectRequire;
function projectRequire() {
  if (!_projectRequire) _projectRequire = createRequire(join(cwd, "package.json"));
  return _projectRequire;
}

let postcssInstance = null;
async function getPostcss() {
  if (postcssInstance !== null) return postcssInstance;
  // 1) Resolve through the project's module graph.
  try {
    const entry = projectRequire().resolve("postcss");
    const mod = await import(pathToFileURL(entry).href);
    postcssInstance = { available: true, default: mod.default ?? mod, mod };
    return postcssInstance;
  } catch {}
  // 2) Hard-coded fallbacks, then a bare import.
  try {
    const candidates = [
      join(cwd, "node_modules", "postcss"),
      join(cwd, "..", "..", "node_modules", "postcss"),
      join(cwd, "..", "..", "..", "node_modules", "postcss"),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        const mod = await import(pathToFileURL(candidate).href);
        postcssInstance = { available: true, default: mod.default ?? mod, mod };
        return postcssInstance;
      }
    }
    const mod = await import("postcss");
    postcssInstance = { available: true, default: mod.default ?? mod, mod };
    return postcssInstance;
  } catch {
    postcssInstance = { available: false };
    return postcssInstance;
  }
}

async function loadPostcssPluginByName(name) {
  // 1) Node resolution from the project root — finds the plugin at any hoist level.
  try {
    const entryPath = projectRequire().resolve(name);
    const mod = await import(pathToFileURL(entryPath).href);
    const result = mod.default ?? mod;
    logLine([` ${paint("dim", "css plugin loaded:")} ${paint("cyan", name)} ${paint("dim", "(resolved)")}`], 1);
    return result;
  } catch {}
  // 2) Fallback: scan a few likely node_modules locations.
  const candidates = [
    join(cwd, "node_modules", name),
    join(cwd, "..", "..", "node_modules", name),
    join(cwd, "..", "..", "..", "node_modules", name),
  ];
  for (const candidate of candidates) {
    const pkgJsonPath = join(candidate, "package.json");
    if (existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
        const exportsRoot = pkg.exports?.["."] ?? {};
        const entry = exportsRoot.import ?? exportsRoot.default ?? pkg.main ?? pkg.module;
        if (typeof entry === "string") {
          const entryPath = join(candidate, entry);
          if (existsSync(entryPath)) {
            const mod = await import(pathToFileURL(entryPath).href);
            const result = mod.default ?? mod;
            logLine([` ${paint("dim", "css plugin loaded:")} ${paint("cyan", name)} ${paint("dim", "from " + relative(cwd, entryPath))}`], 1);
            return result;
          }
        }
      } catch (err) {
        logLine([` ${paint("dim", "css plugin error:")} ${paint("red", err.message)}`], 1);
      }
    }
  }
  logLine([` ${paint("dim", "css plugin not found:")} ${paint("yellow", name)} ${paint("dim", "— is it in dependencies?")}`], 1);
  return null;
}

async function loadPostcssPlugins() {
  const plugins = [];
  const tailwind = await loadPostcssPluginByName("@tailwindcss/postcss");
  if (tailwind) {
    if (typeof tailwind === "function") {
      plugins.push(tailwind());
    } else if (tailwind && typeof tailwind === "object") {
      if (typeof tailwind.postcss === "function") plugins.push(tailwind.postcss());
      else if (typeof tailwind.default === "function") plugins.push(tailwind.default());
      else if (typeof tailwind === "function") plugins.push(tailwind);
    }
  }
  return plugins;
}

async function processCss(css) {
  const pc = await getPostcss();
  if (!pc.available) {
    logLine([` ${paint("dim", "css: postcss not found, inlining raw")}`], 1);
    return css;
  }
  const plugins = await loadPostcssPlugins();
  if (plugins.length === 0) {
    logLine([` ${paint("dim", "css: no plugins loaded, inlining raw")}`], 1);
    return css;
  }
  try {
    const processor = pc.default(plugins);
    const result = await processor.process(css, { from: undefined, to: undefined });
    return result.css;
  } catch (err) {
    logLine([` ${paint("dim", "css process:")} ${paint("red", err.message)}`], 1);
    return css;
  }
}

let globalsCssCache = { file: null, mtime: 0, css: "" };
async function getProcessedGlobalsCss() {
  const file = findAppGlobalsCss();
  if (!file) return "";
  const stat = statSync(file);
  if (globalsCssCache.file === file && globalsCssCache.mtime === stat.mtimeMs) {
    return globalsCssCache.css;
  }
  const raw = readFileSync(file, "utf8");
  const processed = await processCss(raw);
  globalsCssCache = { file, mtime: stat.mtimeMs, css: processed };
  return processed;
}

const GOOGLE_FONT_FAMILIES = new Set();
let fontsScannedFromLayout = false;

const FONT_FAMILY_HINT = /\b(?:Inter|Geist|GeistMono|Geist_Mono|Roboto|Poppins|Manrope|JetBrainsMono|JetbrainsMono|FiraCode|SpaceGrotesk|PlayfairDisplay|Lora|Outfit|Sora|Figtree|PlusJakartaSans|BricolageGrotesque|Cinzel|Caveat|BebasNeue|DmSans|DmSerifDisplay|SourceCodePro|SourceCode3|IBMPlex|IbmPlex|Swift_Rust|Lora|Plus_Jakarta_Sans|Bricolage_Grotesque|Bebas_Neue|DM_Sans|DM_Serif_Display|Source_Code_Pro|IBM_Plex|JetBrains_Mono|Space_Grotesk|Plus_Jakarta_Sans|Bricolage_Grotesque)\b/g;
const FONT_HUMAN_NAME = {
  Geist: "Geist", GeistMono: "Geist Mono", Geist_Mono: "Geist Mono",
  Inter: "Inter", Roboto: "Roboto", Poppins: "Poppins", Manrope: "Manrope",
  JetBrainsMono: "JetBrains Mono", JetbrainsMono: "JetBrains Mono", JetBrains_Mono: "JetBrains Mono",
  FiraCode: "Fira Code", Fira_Code: "Fira Code",
  SpaceGrotesk: "Space Grotesk", Space_Grotesk: "Space Grotesk",
  PlayfairDisplay: "Playfair Display", Playfair_Display: "Playfair Display",
  Lora: "Lora", Outfit: "Outfit", Sora: "Sora", Figtree: "Figtree",
  PlusJakartaSans: "Plus Jakarta Sans", Plus_Jakarta_Sans: "Plus Jakarta Sans",
  BricolageGrotesque: "Bricolage Grotesque", Bricolage_Grotesque: "Bricolage Grotesque",
  Cinzel: "Cinzel", Caveat: "Caveat", BebasNeue: "Bebas Neue", Bebas_Neue: "Bebas Neue",
  DmSans: "DM Sans", DM_Sans: "DM Sans",
  DmSerifDisplay: "DM Serif Display", DM_Serif_Display: "DM Serif Display",
  SourceCodePro: "Source Code Pro", Source_Code_Pro: "Source Code Pro", SourceCode3: "Source Code Pro",
  IBMPlexSans: "IBM Plex Sans", IBM_Plex_Sans: "IBM Plex Sans",
  IbmPlexSans: "IBM Plex Sans",
  IBMPlexMono: "IBM Plex Mono", IBM_Plex_Mono: "IBM Plex Mono",
  IbmPlexMono: "IBM Plex Mono",
  IBMPlexSerif: "IBM Plex Serif", IBM_Plex_Serif: "IBM Plex Serif",
  IbmPlexSerif: "IBM Plex Serif",
};

function scanFontImportsInSource(src) {
  for (const match of src.matchAll(FONT_FAMILY_HINT)) {
    const key = match[0];
    const family = FONT_HUMAN_NAME[key];
    if (family) GOOGLE_FONT_FAMILIES.add(family);
  }
}

async function scanFontsFromLayouts() {
  if (fontsScannedFromLayout) return;
  fontsScannedFromLayout = true;
  const dirs = [APP_DIR, ...(existsSync(join(APP_DIR, "blog")) ? [join(APP_DIR, "blog")] : [])];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const layoutFile = findFile(dir, "layout");
    if (layoutFile) {
      try {
        const src = readFileSync(layoutFile, "utf8");
        scanFontImportsInSource(src);
      } catch {}
    }
  }
}

function buildGoogleFontsLinkTag() {
  const registered = globalThis.__SR_GOOGLE_FONTS__ instanceof Set ? globalThis.__SR_GOOGLE_FONTS__ : null;
  const all = registered ? new Set([...GOOGLE_FONT_FAMILIES, ...registered]) : GOOGLE_FONT_FAMILIES;
  if (all.size === 0) return "";
  const stylesheets = Array.from(all)
    .map((family) => {
      const encodedFamily = encodeGoogleFontFamily(family);
      const key = normalizeGoogleFontClass(family);
      return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodedFamily}&display=swap" data-swift-rust-google-font="${key}" />`;
    })
    .join("\n");
  return `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
${stylesheets}
<style data-swift-rust-google-fonts>${escapeForStyleTag(googleFontClassRules(all))}</style>`;
}

function buildLocalFontsStyleTag() {
  const registered =
    globalThis.__SR_LOCAL_FONT_CSS__ instanceof Set ? globalThis.__SR_LOCAL_FONT_CSS__ : null;
  if (!registered || registered.size === 0) return "";
  return `<style data-swift-rust-local-fonts>${escapeForStyleTag(Array.from(registered).join("\n"))}</style>`;
}

function encodeGoogleFontFamily(family) {
  return encodeURIComponent(family).replace(/%20/g, "+");
}

function normalizeGoogleFontClass(family) {
  return `__swift_rust_font_${family.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
}

function googleFontVariable(family) {
  return `--font-${family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

function googleFontFamilyValue(family) {
  return `'${String(family).replace(/'/g, "\\'")}', system-ui, sans-serif`;
}

function googleFontClassRules(families) {
  return Array.from(families)
    .map((family) => {
      const cls = normalizeGoogleFontClass(family);
      const value = googleFontFamilyValue(family);
      return `.${cls}{font-family:${value}}.${cls}_variable{${googleFontVariable(family)}:${value}}`;
    })
    .join("\n");
}

function mergeMetadata(...metas) {
  const out = {};
  for (const m of metas) {
    if (!m) continue;
    if (m.title) {
      if (typeof m.title === "string") {
        out.title = m.title;
      } else if (m.title.template && m.title.default) {
        out.title = m.title.default;
      } else if (m.title.default) {
        out.title = m.title.default;
      } else if (typeof m.title === "object") {
        out.title = m.title;
      }
    }
    if (m.description) out.description = m.description;
    if (m.keywords) out.keywords = m.keywords;
    if (m.openGraph) out.openGraph = { ...(out.openGraph || {}), ...m.openGraph };
    if (m.twitter) out.twitter = { ...(out.twitter || {}), ...m.twitter };
  }
  return out;
}

function metadataToHead(meta) {
  if (!meta) return "";
  const parts = [];
  if (meta.title) {
    if (typeof meta.title === "string") parts.push(`<title>${escapeHtml(meta.title)}</title>`);
  }
  if (meta.description) parts.push(`<meta name="description" content="${escapeHtml(meta.description)}" />`);
  if (meta.keywords) {
    const kw = Array.isArray(meta.keywords) ? meta.keywords.join(", ") : meta.keywords;
    parts.push(`<meta name="keywords" content="${escapeHtml(kw)}" />`);
  }
  if (meta.openGraph) {
    if (meta.openGraph.title) parts.push(`<meta property="og:title" content="${escapeHtml(meta.openGraph.title)}" />`);
    if (meta.openGraph.description) parts.push(`<meta property="og:description" content="${escapeHtml(meta.openGraph.description)}" />`);
    if (meta.openGraph.type) parts.push(`<meta property="og:type" content="${escapeHtml(meta.openGraph.type)}" />`);
    if (meta.openGraph.url) parts.push(`<meta property="og:url" content="${escapeHtml(meta.openGraph.url)}" />`);
    if (meta.openGraph.images) {
      for (const img of meta.openGraph.images) {
        const url = typeof img === "string" ? img : img.url;
        if (url) parts.push(`<meta property="og:image" content="${escapeHtml(url)}" />`);
        if (typeof img === "object" && img) {
          if (img.width) parts.push(`<meta property="og:image:width" content="${escapeHtml(img.width)}" />`);
          if (img.height) parts.push(`<meta property="og:image:height" content="${escapeHtml(img.height)}" />`);
          if (img.alt) parts.push(`<meta property="og:image:alt" content="${escapeHtml(img.alt)}" />`);
        }
      }
    }
  }
  if (meta.twitter) {
    if (meta.twitter.card) parts.push(`<meta name="twitter:card" content="${escapeHtml(meta.twitter.card)}" />`);
    if (meta.twitter.site) parts.push(`<meta name="twitter:site" content="${escapeHtml(meta.twitter.site)}" />`);
    if (meta.twitter.creator) parts.push(`<meta name="twitter:creator" content="${escapeHtml(meta.twitter.creator)}" />`);
    if (meta.twitter.title) parts.push(`<meta name="twitter:title" content="${escapeHtml(meta.twitter.title)}" />`);
    if (meta.twitter.description) parts.push(`<meta name="twitter:description" content="${escapeHtml(meta.twitter.description)}" />`);
    if (meta.twitter.images) {
      for (const img of meta.twitter.images) {
        const url = typeof img === "string" ? img : img.url;
        if (url) parts.push(`<meta name="twitter:image" content="${escapeHtml(url)}" />`);
      }
    }
  }
  return parts.join("\n");
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function resolveMetadata(layoutFiles, pageFile, params, segments) {
  const metas = [];
  for (const layoutFile of layoutFiles || []) {
    try {
      const mod = await loadModuleFresh(layoutFile);
      if (mod.metadata) metas.push(mod.metadata);
    } catch {}
  }
  if (pageFile) {
    try {
      const mod = await loadModuleFresh(pageFile);
      if (mod.generateMetadata) {
        const m = await mod.generateMetadata({ params: params || {}, searchParams: {} });
        if (m) metas.push(m);
      } else if (mod.metadata) {
        metas.push(mod.metadata);
      }
    } catch {}
  }
  return mergeMetadata(...metas);
}

let _appReactPromise = null;
let _appReactDomEdgePromise = null;
let _appReactDomServerPromise = null;

function getAppRequire() {
  try {
    const pkgPath = join(cwd, "package.json");
    if (existsSync(pkgPath)) return createRequire(pkgPath);
  } catch {}
  return createRequire(import.meta.url);
}

function evalCjsWithFunctionWrapper(filePath) {
  const req = createRequire(filePath);
  const mod = { exports: {} };
  const fn = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    readFileSync(filePath, "utf8"),
  );
  fn(mod.exports, req, mod, filePath, dirname(filePath));
  return mod.exports;
}

async function loadAppReact() {
  if (!_appReactPromise) {
    _appReactPromise = (async () => {
      try {
        const req = getAppRequire();
        return req("react");
      } catch {
        return import("react");
      }
    })();
  }
  return _appReactPromise;
}

async function loadAppReactDomEdge() {
  if (!_appReactDomEdgePromise) {
    _appReactDomEdgePromise = (async () => {
      const req = getAppRequire();
      try {
        return req("react-dom/server.edge");
      } catch (err) {
        if (String(err?.message || "").includes("Expected CommonJS module")) {
          const pkgJson = req.resolve("react-dom/package.json");
          const reactDomDir = dirname(pkgJson);
          const edgeProd = join(reactDomDir, "cjs", "react-dom-server.edge.production.js");
          const legacyProd = join(
            reactDomDir,
            "cjs",
            "react-dom-server-legacy.browser.production.js",
          );
          const b = evalCjsWithFunctionWrapper(edgeProd);
          const l = existsSync(legacyProd) ? evalCjsWithFunctionWrapper(legacyProd) : {};
          return { ...l, ...b };
        }
        return import("react-dom/server.edge");
      }
    })();
  }
  return _appReactDomEdgePromise;
}

async function loadAppReactDomServer() {
  if (!_appReactDomServerPromise) {
    _appReactDomServerPromise = (async () => {
      const req = getAppRequire();
      try {
        return req("react-dom/server");
      } catch (err) {
        if (String(err?.message || "").includes("Expected CommonJS module")) {
          const pkgJson = req.resolve("react-dom/package.json");
          const reactDomDir = dirname(pkgJson);
          const legacyProd = join(
            reactDomDir,
            "cjs",
            "react-dom-server-legacy.browser.production.js",
          );
          return evalCjsWithFunctionWrapper(legacyProd);
        }
        return import("react-dom/server");
      }
    })();
  }
  return _appReactDomServerPromise;
}

async function renderToStringCompat(tree) {
  try {
    const edge = await loadAppReactDomEdge();
    if (typeof edge.renderToReadableStream === "function") {
      const stream = await edge.renderToReadableStream(tree, {
        signal: AbortSignal.timeout(10000),
      });
      if (stream.allReady) await stream.allReady;
      const reader = stream.getReader();
      let html = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        html += new TextDecoder().decode(value);
      }
      return html;
    }
  } catch (err) {
    if (err?.digest === "NOT_FOUND" || err?.name === "NotFoundError") throw err;
    if (err?.digest && String(err.digest).startsWith("REDIRECT")) throw err;
    try {
      const { renderToString } = await loadAppReactDomServer();
      return renderToString(tree);
    } catch (innerErr) {
      if (innerErr?.digest === "NOT_FOUND" || innerErr?.name === "NotFoundError") throw innerErr;
      if (innerErr?.digest && String(innerErr.digest).startsWith("REDIRECT")) throw innerErr;
      throw err;
    }
  }
  const { renderToString } = await loadAppReactDomServer();
  return renderToString(tree);
}

// ── Client islands: page-level "use client" hydration ──────────────────────
// A page whose first meaningful line is `"use client"` is bundled for the
// browser and hydrated, so interactive components (e.g. the Pdf viewer) run.
// Static pages are untouched and ship zero JS.

const islandBundleCache = new Map(); // pageFile -> { mtime, code }

export function isClientPage(file) {
  try {
    for (const raw of readFileSync(file, "utf8").split("\n")) {
      const t = raw.trim();
      if (!t || t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) continue;
      if (/^["']use client["'];?$/.test(t)) return true;
      // allow other leading directives (e.g. 'use bun') before 'use client'
      if (/^["']use [a-z]+["'];?$/.test(t)) continue;
      return false;
    }
  } catch {}
  return false;
}

// True when a file's leading directive prologue contains `'use server'`.
// (Component-level "use server" is NOT supported — swift-rust does classic SSR +
// client islands, not React Server Components / Flight. The only legitimate home
// for 'use server' is a route action.ts file, which is loaded by the router, not
// imported into a page's render tree.)
function hasServerDirective(file) {
  try {
    for (const raw of readFileSync(file, "utf8").split("\n")) {
      const t = raw.trim();
      if (!t || t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) continue;
      if (/^["']use server["'];?$/.test(t)) return true;
      if (/^["']use [a-z]+["'];?$/.test(t)) continue;
      return false;
    }
  } catch {}
  return false;
}

// Walk a page's transitive *relative* import graph looking for a module that
// declares `'use server'`. Returns the offending file (or null). We only follow
// ./ and ../ specifiers — that's where a developer's own components live, and it
// keeps the scan cheap and free of node_modules false positives.
const RELATIVE_EXTS = [".tsx", ".ts", ".jsx", ".js", ".mjs"];
function findServerComponentInClientGraph(entryFile, seen = new Set()) {
  const resolved = resolve(entryFile);
  if (seen.has(resolved)) return null;
  seen.add(resolved);
  let src;
  try {
    src = readFileSync(resolved, "utf8");
  } catch {
    return null;
  }
  // The entry (the page) is allowed to be 'use client'; we only flag *imports*.
  for (const m of src.matchAll(/\b(?:import|export)\b[^'"]*['"](\.[^'"]+)['"]/g)) {
    const spec = m[1];
    const base = resolve(dirname(resolved), spec);
    let target = null;
    const candidates = [base, ...RELATIVE_EXTS.map((e) => base + e), ...RELATIVE_EXTS.map((e) => join(base, "index" + e))];
    for (const c of candidates) {
      try {
        if (statSync(c).isFile()) { target = c; break; }
      } catch {}
    }
    if (!target) continue;
    if (hasServerDirective(target)) {
      try {
        const targetSrc = readFileSync(target, "utf8");
        if (/<[a-zA-Z_][\w.-]*(\s|>|\/)|React\.createElement\s*\(/.test(targetSrc)) {
          return target;
        }
      } catch {}
    }
    const nested = findServerComponentInClientGraph(target, seen);
    if (nested) return nested;
  }
  return null;
}

// Throw a clear, actionable error when a 'use client' page pulls a component
// that declares 'use server'. Replaces the old silent no-op (the component used
// to be imported but its directive ignored, so nothing ran and nothing warned).
export function assertNoServerComponentInClientPage(pageFile) {
  if (!isClientPage(pageFile)) return;
  const offender = findServerComponentInClientGraph(pageFile);
  if (offender) throw toError(serverInClientDiagnostic(pageFile, offender, cwd));
}

const VALID_RUNTIMES = new Set(["bun", "edge", "node", "worker"]);

// Detect a `'use bun' | 'use edge' | 'use node'` directive among a file's
// leading string-literal directives (alongside an optional 'use client').
export function detectRuntimeDirective(file) {
  try {
    for (const raw of readFileSync(file, "utf8").split("\n")) {
      const t = raw.trim();
      if (!t || t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) continue;
      const m = t.match(/^["']use (bun|edge|node|worker)["'];?$/);
      if (m) return m[1];
      if (/^["']use [a-z]+["'];?$/.test(t)) continue; // other directive, keep scanning
      return null; // first non-directive line ends the directive prologue
    }
  } catch {}
  return null;
}

// True if a file declares a `'use <name>'` directive among its leading
// string-literal directives (coexists with 'use client' / 'use bun' / etc.).
export function hasUseDirective(file, name) {
  try {
    const re = new RegExp(`^["']use ${name}["'];?$`);
    for (const raw of readFileSync(file, "utf8").split("\n")) {
      const t = raw.trim();
      if (!t || t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) continue;
      if (re.test(t)) return true;
      if (/^["']use [a-z]+["'];?$/.test(t)) continue;
      return false;
    }
  } catch {}
  return false;
}

const islandBundleInflight = new Map();
async function buildIslandBundle(pageFile) {
  if (typeof Bun === "undefined" || typeof Bun.build !== "function") {
    throw new Error("client islands require the Bun runtime");
  }
  assertNoServerComponentInClientPage(pageFile);
  const cached = islandBundleCache.get(pageFile);
  if (cached && cached.gen === buildGeneration) return cached.code;
  return withInflight(islandBundleInflight, pageFile, buildGeneration, () =>
    buildIslandBundleNow(pageFile),
  );
}
async function buildIslandBundleNow(pageFile) {
  // Temp hydration entry, written next to the page so module resolution works.
  const entryPath = join(
    dirname(pageFile),
    `.__sr_island_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}.js`,
  );
  const entry = `import { createRoot } from "react-dom/client";
import { createElement } from "react";
import Page from ${JSON.stringify(pageFile)};
const el = document.getElementById("__sr_island_root");
if (el) {
  let params = {};
  try { params = JSON.parse(el.getAttribute("data-sr-params") || "{}"); } catch {}
  // Client-render (not hydrate): "use client" pages contain client-only
  // widgets (e.g. the pdf.js viewer) whose SSR output intentionally differs
  // from the first client render, so hydration would mismatch.
  el.innerHTML = "";
  createRoot(el).render(createElement(Page, { params }));
}
`;
  writeFileSync(entryPath, entry);
  try {
    let result;
    try {
      result = await Bun.build({
        entrypoints: [entryPath],
        target: "browser",
        minify: true,
        plugins: [makeServerActionClientPlugin()],
        define: { "process.env.NODE_ENV": '"production"' },
      });
    } catch (buildErr) {
      throw normalizeBuildError(buildErr, [], cwd);
    }
    if (!result.success) {
      throw normalizeBuildError(null, result.logs, cwd);
    }
    const code = await result.outputs[0].text();
    islandBundleCache.set(pageFile, { gen: buildGeneration, code });
    return code;
  } finally {
    try { unlinkSync(entryPath); } catch {}
  }
}

// ── Routing-file error handling & convention validation ─────────────────────

class RoutingFileError extends Error {
  constructor(kind, file, cause) {
    super(`Error in ${kind} (${relative(cwd, file)}): ${cause?.message ?? cause}`);
    this.name = "RoutingFileError";
    this.kind = kind;
    this.file = file;
    this.cause = cause;
    if (cause?.stack) this.stack = cause.stack;
  }
}

const warnedRouting = new Set();
function warnRoutingFile(file, appRel) {
  if (warnedRouting.has(file)) return;
  warnedRouting.add(file);
  const diagnostic = diagnose({ diagnostic: routingFileWarning(file, appRel, cwd) }, { cwd });
  setIssue(`routing:${file}`, diagnostic);
  logDiagnostic(diagnostic);
}

/** Warn when routing files are placed where the router will never find them
 *  (e.g. proxy.ts at the project root, or routing files in app/ when the app
 *  uses an app/src/ directory). Helps catch a very common mistake early. */
function validateRoutingConventions() {
  const names = [...SPECIAL_FILES, "page"];
  const appRel = relative(cwd, APP_DIR) || "app";
  const srcRoot = dirname(APP_DIR);
  const usesSrc = basename(APP_DIR) === "app" && basename(srcRoot) === "src";
  const scan = (dir, allow = []) => {
    if (!existsSync(dir) || resolve(dir) === resolve(APP_DIR)) return;
    for (const name of names) {
      if (allow.includes(name)) continue;
      const f = findFile(dir, name);
      if (f) warnRoutingFile(f, appRel);
    }
  };
  scan(cwd);
  // proxy.ts is allowed to live at the src/ root (sibling of src/app).
  if (usesSrc) scan(srcRoot, ["proxy"]);
}

// ── RFC 0001 route pipeline: config → schema → guard → loader/action ────────

let routerRuntimePromise = null;
function routerRuntime() {
  if (!routerRuntimePromise) routerRuntimePromise = import("swift-rust/router").catch(() => null);
  return routerRuntimePromise;
}

function parseCookieHeader(header) {
  const map = new Map();
  for (const part of (header || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) map.set(k, decodeURIComponent(part.slice(i + 1).trim()));
  }
  return map;
}
function serializeCookie(name, value, opts = {}) {
  let s = `${name}=${encodeURIComponent(value)}`;
  if (opts.maxAge != null) s += `; Max-Age=${opts.maxAge}`;
  if (opts.path) s += `; Path=${opts.path}`;
  else s += "; Path=/";
  if (opts.domain) s += `; Domain=${opts.domain}`;
  if (opts.httpOnly) s += "; HttpOnly";
  if (opts.secure) s += "; Secure";
  if (opts.sameSite) s += `; SameSite=${opts.sameSite[0].toUpperCase()}${opts.sameSite.slice(1)}`;
  return s;
}

function buildRouteCtx(req, url, params, searchParams) {
  const cookieMap = parseCookieHeader(req?.headers?.get?.("cookie") || "");
  const setCookies = [];
  const cookies = {
    get: (n) => cookieMap.get(n),
    set: (n, v, o) => { cookieMap.set(n, v); setCookies.push(serializeCookie(n, v, o)); },
    delete: (n, o) => { cookieMap.delete(n); setCookies.push(serializeCookie(n, "", { ...o, maxAge: 0 })); },
    all: () => cookieMap,
  };
  const localsMap = new Map();
  return {
    url,
    method: req?.method || "GET",
    headers: req?.headers || new Headers(),
    cookies,
    params,
    searchParams,
    runtime: "bun",
    locals: { get: (k) => localsMap.get(k), set: (k, v) => localsMap.set(k, v) },
    request: req,
    __setCookies: setCookies,
  };
}

// Turn a returned RouteControl object into a thrown control the catch handles.
function applyControl(c) {
  if (!c || typeof c !== "object" || !c.kind) return;
  if (c.kind === "next") return;
  const e = new Error(`route control: ${c.kind}`);
  if (c.kind === "redirect") e.digest = `REDIRECT;${c.status || 307};${c.to}`;
  else if (c.kind === "rewrite") e.digest = `REWRITE;${c.to}`;
  else if (c.kind === "notFound") e.digest = "NOT_FOUND";
  else if (c.kind === "response") e.__response = c.response;
  else if (c.kind === "error") { throw c.error ?? new Error("route error"); }
  throw e;
}

// swift-rust.config.json (read once) — provides the project default runtime.
let _globalConfig;
function loadGlobalConfig() {
  if (_globalConfig !== undefined) return _globalConfig;
  try {
    _globalConfig = existsSync(SWIFT_RUST_CONFIG) ? JSON.parse(readFileSync(SWIFT_RUST_CONFIG, "utf8")) : {};
  } catch {
    _globalConfig = {};
  }
  return _globalConfig;
}

// Resolve a `'use bun'|'use edge'|'use node'` directive for a route's tree:
// the page wins, then layouts innermost → outermost.
function resolveTreeRuntimeDirective(route, chain) {
  if (route?.file) {
    const d = detectRuntimeDirective(route.file);
    if (d) return d;
  }
  const layouts = collectRouteFiles(chain, "layout"); // outer → inner
  for (let i = layouts.length - 1; i >= 0; i--) {
    const d = detectRuntimeDirective(layouts[i].file);
    if (d) return d;
  }
  return null;
}

// guard.ts runs only when explicitly opted in: a `'use guard'` directive in the
// route tree (page/layout/config), config.ts `{ guard: true }`, or the global
// `autoApplyGuard: true`. Default is off (autoApplyGuard defaults to false).
function shouldRunGuard(route, chain, config) {
  if (route?.file && hasUseDirective(route.file, "guard")) return true;
  for (const { file } of collectRouteFiles(chain, "layout")) {
    if (hasUseDirective(file, "guard")) return true;
  }
  for (const { file } of collectRouteFiles(chain, "config")) {
    if (hasUseDirective(file, "guard")) return true;
  }
  if (config?.guard === true) return true;
  if (loadGlobalConfig().autoApplyGuard === true) return true;
  return false;
}

/** Merge config.ts along the chain (inner overrides outer) + resolve runtime. */
async function readMergedConfig(chain, route) {
  let config = {};
  for (const { file } of collectRouteFiles(chain, "config")) {
    const mod = await loadModuleFresh(file);
    const c = mod.config ?? mod.default;
    if (c && typeof c === "object") config = { ...config, ...c, headers: { ...config.headers, ...c.headers } };
  }
  // edge.ts / worker.ts force a runtime (file-based, like a directive).
  const edge = await collectFirst(chain, "edge");
  if (edge && (edge.edge || edge.default)) config.runtime = "edge";
  const worker = await collectFirst(chain, "worker");
  if (worker && (worker.default || worker.bindings)) config.runtime = "worker";

  // Runtime resolution (highest priority first):
  //   'use bun|edge|node' directive  →  config.ts / edge.ts / worker.ts
  //   →  swift-rust.config.json "runtime"  →  default "bun".
  const explicitRuntime = config.runtime != null; // set by config.ts / edge / worker
  const directive = resolveTreeRuntimeDirective(route, chain);
  const fromJson = loadGlobalConfig().runtime;
  let runtime = directive ?? config.runtime ?? fromJson ?? "bun";
  if (!VALID_RUNTIMES.has(runtime)) {
    const key = `runtime:${runtime}`;
    if (!devIssues.has(key)) {
      const diagnostic = diagnose({ diagnostic: invalidRuntimeWarning(runtime, [...VALID_RUNTIMES]) }, { cwd });
      setIssue(key, diagnostic);
      logDiagnostic(diagnostic);
    }
    runtime = "bun";
  }
  config.runtime = runtime;
  // A route is "dynamic" (emitted as a request-time function) when it explicitly
  // opts into a runtime via a directive, config.ts/edge/worker, or config.dynamic.
  config.dynamic = Boolean(directive) || explicitRuntime || config.dynamic === true;

  // `use static` (page directive) or config.static: a hard guarantee that the
  // route is purely static — no request-time/dynamic behavior. We fail loudly on
  // any conflict so the guarantee can't silently rot, then force the route static
  // and tag it for aggressive caching. (The actual prerender happens in build;
  // here we enforce + emit the cache contract.)
  const wantsStatic =
    (route?.file && hasUseDirective(route.file, "static")) ||
    collectRouteFiles(chain, "config").some(({ file }) => hasUseDirective(file, "static")) ||
    config.static === true;
  if (wantsStatic) {
    const reasons = [];
    if (directive) reasons.push(`a 'use ${directive}' runtime directive (declares a request-time runtime)`);
    else if (explicitRuntime) reasons.push("a runtime set by config.ts / edge.ts / worker.ts");
    if (config.dynamic === true && !directive && !explicitRuntime) reasons.push("config.dynamic = true");
    if (collectRouteFiles(chain, "action").length) reasons.push("an action.ts (mutations are dynamic)");
    if (reasons.length) throw toError(useStaticConflictDiagnostic(route?.file, reasons, cwd));
    config.dynamic = false;
    config.static = true;
  }
  config.headers = {
    "x-swift-rust-runtime": runtime,
    ...(config.dynamic ? { "x-swift-rust-dynamic": "1" } : {}),
    ...(config.static ? { "x-swift-rust-render": "static" } : {}),
    ...config.headers,
  };
  return config;
}

async function runRoutePipeline(route, ctx) {
  const chain = route.dirChain || [];

  // proxy.ts — phase 1, outer → inner. Cheap, data-free interception
  // (Next.js calls this "proxy"; "middleware" is accepted with a warning).
  // When using a src/ directory, a root proxy lives at src/proxy.ts (sibling
  // of src/app), so it runs before any in-app proxy.
  const proxyFiles = [];
  const srcRoot = dirname(APP_DIR);
  if (basename(APP_DIR) === "app" && basename(srcRoot) === "src") {
    const rootProxy = findFile(srcRoot, "proxy");
    if (rootProxy) proxyFiles.push({ file: rootProxy, dir: srcRoot });
  }
  proxyFiles.push(...collectRouteFiles(chain, "proxy"));
  for (const { file } of proxyFiles) {
    const mod = await loadModuleFresh(file);
    const fn = mod.default ?? mod.proxy;
    if (typeof fn === "function") {
      const matcher = mod.matcher;
      const matched = !matcher || matchesMatcher(ctx.url.pathname, matcher);
      if (matched) {
        try {
          applyControl(await fn(ctx));
        } catch (e) {
          if (e?.digest || e?.__response) throw e; // control flow, re-throw
          throw new RoutingFileError("proxy", file, e);
        }
      }
    }
  }
  // Back-compat: warn if the old name is used.
  for (const { file } of collectRouteFiles(chain, "middleware")) {
    warnRoutingFile(file, `"middleware.ts" was renamed to "proxy.ts" — rename ${relative(cwd, file)}.`);
    const mod = await loadModuleFresh(file);
    const fn = mod.default ?? mod.middleware;
    if (typeof fn === "function") {
      const matcher = mod.matcher;
      if (!matcher || matchesMatcher(ctx.url.pathname, matcher)) applyControl(await fn(ctx));
    }
  }

  // config.ts — merged, applied to the response by the caller.
  const config = await readMergedConfig(chain, route);
  ctx.runtime = config.runtime;

  // i18n.ts — resolve the active locale into locals (cookie/header/default).
  const i18nMod = await collectFirst(chain, "i18n");
  const i18nCfg = i18nMod?.i18n ?? i18nMod?.default;
  if (i18nCfg && Array.isArray(i18nCfg.locales)) {
    let locale = i18nCfg.defaultLocale ?? i18nCfg.locales[0];
    if (typeof i18nCfg.resolve === "function") locale = (await i18nCfg.resolve(ctx)) || locale;
    else if (i18nCfg.strategy === "cookie") locale = ctx.cookies.get("locale") || locale;
    else if (i18nCfg.strategy === "header") {
      const al = ctx.headers.get?.("accept-language")?.split(",")[0]?.split("-")[0];
      if (al && i18nCfg.locales.includes(al)) locale = al;
    }
    ctx.locals.set("locale", locale);
    ctx.__locale = locale;
  }

  // schema.ts — validate/brand params + searchParams (Standard-Schema/Zod-like)
  for (const { file } of collectRouteFiles(chain, "schema")) {
    const mod = await loadModuleFresh(file);
    if (mod.params?.safeParse) {
      const r = mod.params.safeParse(ctx.params);
      if (!r.success) { const e = new Error("Invalid params"); e.__response = jsonResponse({ error: "Invalid params", issues: r.error?.issues ?? r.error }, 400); throw e; }
      Object.assign(ctx.params, r.data);
    }
    const querySpec = (await collectFirst(chain, "query"))?.query;
    const searchSchema = querySpec?.parse ?? mod.searchParams;
    if (searchSchema?.safeParse) {
      const r = searchSchema.safeParse(ctx.searchParams);
      if (r.success) Object.assign(ctx.searchParams, r.data);
    }
  }

  // guard.ts — outer → inner. Opt-in via 'use guard' / config.guard /
  // global autoApplyGuard (see shouldRunGuard).
  if (shouldRunGuard(route, chain, config)) {
    config.headers = { ...config.headers, "x-swift-rust-guard": "1" };
    for (const { file } of collectRouteFiles(chain, "guard")) {
      const mod = await loadModuleFresh(file);
      const fn = mod.default ?? mod.guard;
      if (typeof fn === "function") {
        try {
          applyControl(await fn(ctx));
        } catch (e) {
          if (e?.digest || e?.__response) throw e;
          throw new RoutingFileError("guard", file, e);
        }
      } else if (mod.default !== undefined || mod.guard !== undefined) {
        warnRoutingFile(file, `guard.ts must export a function (default export). ${relative(cwd, file)}`);
      }
    }
  }

  let actionData;
  // action.ts on mutating requests (leaf only)
  if (ctx.method !== "GET" && ctx.method !== "HEAD") {
    const actions = collectRouteFiles(chain, "action");
    const leaf = actions[actions.length - 1];
    if (leaf) {
      const mod = await loadModuleFresh(leaf.file);
      const fn = mod.default ?? mod.action;
      if (typeof fn === "function") {
        const actx = Object.assign({}, ctx, {
          formData: () => ctx.request.formData(),
          json: () => ctx.request.json(),
        });
        try {
          const result = await fn(actx);
          applyControl(result);
          actionData = result;
        } catch (e) {
          if (e?.digest || e?.__response) throw e;
          throw new RoutingFileError("action", leaf.file, e);
        }
      }
    }
  }

  // loader.ts — run in parallel along the chain
  const loaders = collectRouteFiles(chain, "loader");
  const loaded = await Promise.all(
    loaders.map(async ({ file, dir }) => {
      const mod = await loadModuleFresh(file);
      const fn = mod.default ?? mod.loader;
      if (typeof fn !== "function") return [dir, undefined];
      const lctx = Object.assign({}, ctx, { parent: () => undefined });
      try {
        return [dir, await fn(lctx)];
      } catch (e) {
        if (e?.digest || e?.__response) throw e;
        throw new RoutingFileError("loader", file, e);
      }
    }),
  );
  const loadersMap = {};
  for (const [dir, data] of loaded) loadersMap[relative(cwd, dir)] = data;
  const loaderData = loaded.length ? loaded[loaded.length - 1][1] : undefined;

  // state.ts — server-side state to hydrate a client store.
  let serverState;
  const stateMod = await collectFirst(chain, "state");
  const stateFn = stateMod?.default ?? stateMod?.state;
  if (typeof stateFn === "function") serverState = await stateFn(ctx);

  // seo.tsx — structured data / head injection (has loader data).
  let seoHead = "";
  const seoMod = await collectFirst(chain, "seo");
  const seoFn = seoMod?.default ?? seoMod?.seo;
  if (typeof seoFn === "function") {
    seoHead = buildSeoHead(await seoFn(Object.assign({}, ctx, { data: loaderData })));
  }

  // revalidate.ts — leaf decides cache TTL / tags.
  let revalidatePlan = config.revalidate != null ? { ttl: config.revalidate } : undefined;
  const rev = await collectFirst(chain, "revalidate");
  const revFn = rev?.default ?? rev?.revalidate;
  if (typeof revFn === "function") {
    const plan = await revFn(Object.assign({}, ctx, { data: loaderData, afterAction: ctx.method !== "GET" }));
    if (plan && typeof plan === "object") revalidatePlan = { ...revalidatePlan, ...plan };
  }

  return { actionData, loaderData, loaders: loadersMap, setCookies: ctx.__setCookies, config, revalidatePlan, serverState, seoHead };
}

function escAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
function buildSeoHead(r) {
  if (!r || typeof r !== "object") return "";
  const out = [];
  if (r.title) out.push(`<title>${escAttr(r.title)}</title>`);
  if (r.description) out.push(`<meta name="description" content="${escAttr(r.description)}" />`);
  if (r.canonical) out.push(`<link rel="canonical" href="${escAttr(r.canonical)}" />`);
  if (r.robots) out.push(`<meta name="robots" content="${escAttr(r.robots)}" />`);
  for (const [k, v] of Object.entries(r.openGraph || {})) out.push(`<meta property="og:${escAttr(k)}" content="${escAttr(v)}" />`);
  for (const a of r.alternates || []) out.push(`<link rel="alternate" hreflang="${escAttr(a.hreflang)}" href="${escAttr(a.href)}" />`);
  const jsonLd = r.jsonLd ? (Array.isArray(r.jsonLd) ? r.jsonLd : [r.jsonLd]) : [];
  for (const ld of jsonLd) out.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`);
  return out.join("\n");
}

async function collectFirst(chain, basename) {
  const files = collectRouteFiles(chain, basename);
  if (files.length === 0) return null;
  return await loadModuleFresh(files[files.length - 1].file);
}

function matchesMatcher(pathname, matcher) {
  const list = Array.isArray(matcher) ? matcher : [matcher];
  return list.some((m) => {
    if (typeof m !== "string") return false;
    // simple glob: * → [^/]*, ** → .*
    const re = new RegExp("^" + m.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "::").replace(/\*/g, "[^/]*").replace(/::/g, ".*") + "$");
    return re.test(pathname);
  });
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

function cacheControlFromPlan(plan) {
  if (!plan) return null;
  if (plan.ttl === false) return "public, max-age=31536000, immutable";
  if (plan.ttl === 0) return "no-store";
  if (typeof plan.ttl === "number") return `public, max-age=0, s-maxage=${plan.ttl}, stale-while-revalidate`;
  return null;
}

// ── Parallel routes (@slot dirs → fragment / fallback / default) ────────────
function findDynamicChild(dir) {
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && /^\[.+\]$/.test(e.name)) return join(dir, e.name);
    }
  } catch {}
  return null;
}

// Resolve one @slot dir against the URL segments below its layout. Returns a
// React element (the slot's matched page/fragment, its default.tsx, wrapped in
// any slot layouts + a fallback.tsx Suspense boundary) or null.
async function resolveSlotElement(slotDir, segs, req, intercepted) {
  const React = await loadAppReact();
  let leafFile = null;
  const slotLayouts = [];
  let matchedParams = {};

  if (intercepted) {
    leafFile = intercepted.pageFile;
    matchedParams = intercepted.params || {};
    const rootLayout = findFile(slotDir, "layout");
    if (rootLayout) slotLayouts.push(rootLayout);
  } else {
    let cur = slotDir;
    let matched = true;
    for (let i = 0; i < segs.length; i++) {
      const layoutFile = findFile(cur, "layout");
      if (layoutFile) slotLayouts.push(layoutFile);
      let next = join(cur, segs[i]);
      if (!existsSync(next) || !statSync(next).isDirectory()) {
        const dyn = findDynamicChild(cur);
        if (dyn) next = dyn;
        else {
          matched = false;
          break;
        }
      }
      cur = next;
    }
    if (matched) {
      const layoutFile = findFile(cur, "layout");
      if (layoutFile && !slotLayouts.includes(layoutFile)) slotLayouts.push(layoutFile);
      leafFile = findFile(cur, "page") || findFile(cur, "fragment");
    }
    if (!leafFile) {
      // Unmatched slot → closest default.tsx (Next.js semantics), else nothing.
      let def = findFile(cur, "default") || findFile(slotDir, "default");
      if (!def) {
        let p = cur;
        while (p.length > slotDir.length && !def) {
          p = dirname(p);
          def = findFile(p, "default");
        }
      }
      if (!def) return null;
      leafFile = def;
      slotLayouts.length = 0;
      const rootLayout = findFile(slotDir, "layout");
      if (rootLayout) slotLayouts.push(rootLayout);
    }
  }

  let mod;
  try {
    mod = await loadModuleFresh(leafFile);
  } catch {
    return null;
  }
  const Comp = mod.default ?? mod.Page ?? mod.Fragment ?? mod.page ?? mod.fragment;
  if (!Comp) return null;
  let el = React.createElement(Comp, { params: matchedParams });
  for (let i = slotLayouts.length - 1; i >= 0; i--) {
    try {
      const lm = await loadModuleFresh(slotLayouts[i]);
      const L = lm.default ?? lm.Layout ?? lm.layout;
      if (L) el = React.createElement(L, null, el);
    } catch {}
  }
  const fallbackFile = findFile(slotDir, "fallback");
  if (fallbackFile) {
    try {
      const fb = await loadModuleFresh(fallbackFile);
      const Fallback = fb.default ?? fb.Fallback;
      if (Fallback) el = React.createElement(React.Suspense, { fallback: React.createElement(Fallback, {}) }, el);
    } catch {}
  }
  return el;
}

// Collect all @slot dirs of a layout dir into named props for the layout.
async function resolveParallelSlots(dir, segs, req, activeIntercept) {
  const slots = {};
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return slots;
  }
  for (const e of entries) {
    if (e.isDirectory() && e.name.startsWith("@")) {
      const slotName = e.name.slice(1);
      const isIntercepted = activeIntercept && activeIntercept.ownerDir === dir && activeIntercept.slotName === slotName;
      const el = await resolveSlotElement(
        join(dir, e.name),
        segs,
        req,
        isIntercepted ? activeIntercept : null,
      );
      if (el) slots[slotName] = el;
    }
  }
  return slots;
}

async function renderRoute(urlPath, req) {
  const segments = urlToRouteSegments(urlPath);
  const isSoftNav = Boolean(req && (req.headers?.get?.("x-swift-rust-nav") === "1" || req.headers?.get?.("x-swift-rust-from")));
  let activeIntercept = null;
  let route = null;
  if (isSoftNav) {
    const fromHeader = req.headers?.get?.("x-swift-rust-from") || (req.headers?.get?.("referer") ? new URL(req.headers.get("referer")).pathname : null);
    const fromSegments = fromHeader ? urlToRouteSegments(fromHeader) : null;
    const allIntercepts = findInterceptingRoutes(APP_DIR);
    for (const intercept of allIntercepts) {
      const match = matchPatternSegments(intercept.patternSegments, segments);
      if (match.matched) {
        if (intercept.slotName) {
          activeIntercept = { ...intercept, params: match.params };
          const bgSegments = fromSegments || findRouteSegmentsForDir(intercept.ownerDir);
          route = resolvePageRoute(bgSegments) || resolvePageRoute([]);
          if (route) {
            route.params = { ...route.params, ...match.params };
          }
          break;
        } else {
          route = { file: intercept.pageFile, params: match.params, segments, dirChain: intercept.dirChain };
          break;
        }
      }
    }
  }
  if (!route) {
    route = resolvePageRoute(segments);
  }
  if (!route) {
    return await renderNotFound(segments);
  }
  const layouts = findLayoutsFor(segments, route.dirChain);
  const notFoundFile = findNotFound(segments);
  const errorFile = findErrorBoundary(segments);
  const loadingFile = findLoading(segments);

  // Reset per-render Google font registry so each page only requests the
  // families it actually uses (factories re-register during render).
  globalThis.__SR_GOOGLE_FONTS__ = new Set();
  if (!(globalThis.__SR_LOCAL_FONT_CSS__ instanceof Set)) {
    globalThis.__SR_LOCAL_FONT_CSS__ = new Set();
  }

  try {
    const React = await loadAppReact();
    const url = req ? new URL(req.url) : new URL(urlPath, "http://localhost");
    const searchParams = Object.fromEntries(url.searchParams.entries());
    const ctx = buildRouteCtx(req, url, { ...route.params }, searchParams);

    // Run the RFC 0001 pipeline (config/schema/guard/loader/action).
    const pipeline = await runRoutePipeline(route, ctx);
    route.params = ctx.params; // validated/branded params flow to the page

    const runtime = await routerRuntime();
    if (runtime?.__setRouteContext) {
      runtime.__setRouteContext({
        request: ctx,
        loaderData: pipeline.loaderData,
        actionData: pipeline.actionData,
        loaders: pipeline.loaders,
      });
    }

    // variant.tsx — pick an A/B variant component (bucket from middleware/
    // cookie/assign), else fall back to page.tsx.
    let Page;
    const leafDir = (route.dirChain || [])[(route.dirChain || []).length - 1];
    const variantFile = leafDir && findFile(leafDir, "variant");
    if (variantFile) {
      const vmod = await loadModuleFresh(variantFile);
      if (vmod.variants && typeof vmod.variants === "object") {
        const bucket =
          (typeof vmod.assign === "function" ? vmod.assign(ctx) : null) ||
          ctx.locals.get("bucket") ||
          ctx.cookies.get("bucket") ||
          Object.keys(vmod.variants)[0];
        const loader = vmod.variants[bucket];
        if (typeof loader === "function") {
          const m = await loader();
          Page = m.default ?? m;
        }
      }
    }
    let pageMod = null;
    if (!Page) {
      pageMod = await loadModuleFresh(route.file);
      Page = pageMod.default ?? pageMod.Page ?? pageMod.page;
    } else {
      try { pageMod = await loadModuleFresh(route.file); } catch {}
    }
    if (!Page) {
      return { status: 500, html: null, error: toError(missingDefaultExportDiagnostic(route.file, cwd)), pageFile: route.file, segments };
    }

    const paramsProxy = new Proxy(route.params || {}, {
      get: (t, k) => (k in t ? t[k] : dynamicParams.get(String(k))),
    });

    const clientPage = isClientPage(route.file);
    if (clientPage) {
      // Loud failure (was a silent no-op): a 'use server' component imported into
      // a 'use client' page can't run on the server in this SSR+islands model.
      assertNoServerComponentInClientPage(route.file);
    }
    let tree = React.createElement(Page, { params: paramsProxy });
    if (clientPage) {
      // Wrap in a hydration root so the client bundle can mount into it.
      tree = React.createElement(
        "div",
        { id: "__sr_island_root", "data-sr-params": JSON.stringify(route.params || {}) },
        tree,
      );
    }
    // Wrap the page with each segment's template then layout, innermost dir
    // first, so the nesting is layout > template > children (Next.js order).
    // template.tsx re-mounts on navigation; on the server it just wraps.
    const dirChain = route.dirChain && route.dirChain.length ? route.dirChain : [APP_DIR];
    for (let i = dirChain.length - 1; i >= 0; i--) {
      const dir = dirChain[i];
      const templateFile = findFile(dir, "template");
      if (templateFile) {
        const tmod = await loadModuleFresh(templateFile);
        const Template = tmod.default ?? tmod.Template ?? tmod.template;
        if (Template) tree = React.createElement(Template, null, tree);
      }
      const layoutFile = findFile(dir, "layout");
      if (layoutFile) {
        const layoutMod = await loadModuleFresh(layoutFile);
        const Layout = layoutMod.default ?? layoutMod.Layout ?? layoutMod.layout;
        if (Layout) {
          // Parallel routes: @slot subdirs of this layout become named props.
          const slotProps = await resolveParallelSlots(dir, segments.slice(i), req, activeIntercept);
          tree = React.createElement(Layout, slotProps, tree);
        }
      }
    }
    // shell.tsx — root-only. Lets the app own the outer document
    // (<html>/<body>/providers); the framework injects head assets + body
    // scripts into what it renders (see the fullDocument branch in handleFetch).
    let fullDocument = false;
    const shellFile = findFile(APP_DIR, "shell");
    if (shellFile) {
      try {
        const sm = await loadModuleFresh(shellFile);
        const Shell = sm.default ?? sm.Shell ?? sm.shell;
        if (Shell) {
          tree = React.createElement(Shell, null, tree);
          fullDocument = true;
        }
      } catch {}
    }
    const html = await renderToStringCompat(tree);
    if (runtime?.__setRouteContext) runtime.__setRouteContext(null);
    const metadata = await resolveMetadata(layouts.map((l) => l.file), route.file, route.params, segments);
    const isPpr = Boolean(
      pageMod?.experimental_ppr ||
      pageMod?.config?.ppr ||
      pipeline.config?.ppr ||
      pipeline.config?.experimental_ppr
    );
    return { status: 200, html, metadata, error: null, clientPage, params: route.params, pageFile: route.file, layoutFiles: layouts.map((l) => l.file), notFoundFile, errorFile, loadingFile, segments, setCookies: pipeline.setCookies, actionData: pipeline.actionData, config: pipeline.config, revalidatePlan: pipeline.revalidatePlan, seoHead: pipeline.seoHead, serverState: pipeline.serverState, fullDocument, ppr: isPpr };
  } catch (err) {
    const rt = await routerRuntime();
    if (rt?.__setRouteContext) rt.__setRouteContext(null);
    if (err?.__response instanceof Response) {
      return { status: err.__response.status, rawResponse: err.__response, html: null, error: null, segments };
    }
    if (err?.digest === "NOT_FOUND" || err?.name === "NotFoundError") {
      return await renderNotFound(segments);
    }
    if (err?.digest === "FORBIDDEN" || err?.name === "ForbiddenError") {
      return { status: 403, html: null, error: null, segments, rawResponse: new Response("Forbidden", { status: 403, headers: { "Content-Type": "text/plain" } }) };
    }
    if (err?.digest === "UNAUTHORIZED" || err?.name === "UnauthorizedError") {
      return { status: 401, html: null, error: null, segments, rawResponse: new Response("Unauthorized", { status: 401, headers: { "Content-Type": "text/plain" } }) };
    }
    if (err?.digest && String(err.digest).startsWith("REWRITE")) {
      const to = String(err.digest).slice("REWRITE;".length);
      return await renderRoute(to, req);
    }
    if (err?.digest && String(err.digest).startsWith("REDIRECT")) {
      const [, statusStr, ...rest] = String(err.digest).split(";");
      return { status: parseInt(statusStr, 10) || 307, redirect: rest.join(";"), html: null, error: null, segments };
    }
    if (errorFile) {
      try {
        const React = await loadAppReact();
        const errorMod = await loadModuleFresh(errorFile);
        const ErrorBoundary = errorMod.default ?? errorMod.ErrorBoundary ?? errorMod.error;
        if (ErrorBoundary) {
          const html = await renderToStringCompat(React.createElement(ErrorBoundary, { error: err }));
          return { status: 500, html, metadata: null, error: err, segments, pageFile: route.file, errorFile };
        }
      } catch {}
    }
    // error-recovery.tsx — richer boundary with retry/reset (SSR: stub callbacks).
    const recoveryFile = findRouteFileUp(segments, "error-recovery");
    if (recoveryFile) {
      try {
        const React = await loadAppReact();
        const mod = await loadModuleFresh(recoveryFile);
        const Recovery = mod.default ?? mod.ErrorRecovery;
        if (Recovery) {
          const html = await renderToStringCompat(
            React.createElement(Recovery, { error: err, attempt: 1, retry: () => {}, reset: () => {} }),
          );
          return { status: 500, html, metadata: null, error: err, segments, pageFile: route.file };
        }
      } catch {}
    }
    // global-error.tsx — root-level boundary. It renders its own <html>/<body>,
    // so it replaces the whole document. Only kicks in for uncaught errors when
    // no closer error/error-recovery boundary handled them.
    const globalErrorFile = findFile(APP_DIR, "global-error");
    if (globalErrorFile) {
      try {
        const React = await loadAppReact();
        const mod = await loadModuleFresh(globalErrorFile);
        const GlobalError = mod.default ?? mod.GlobalError;
        if (GlobalError) {
          const inner = await renderToStringCompat(
            React.createElement(GlobalError, { error: err, reset: () => {} }),
          );
          // status:200 here only gates past the dev error overlay; the
          // rawResponse carries the real 500 to the client.
          return {
            status: 200,
            html: null,
            error: null,
            segments,
            rawResponse: new Response(`<!DOCTYPE html>${inner}`, {
              status: 500,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            }),
          };
        }
      } catch {}
    }
    return { status: 500, html: null, error: err, segments, pageFile: route.file, layoutFiles: layouts.map((l) => l.file), errorFile };
  }
}

async function resolveTransitionConfig(segments) {
  const file = findRouteFileUp(segments || [], "transition");
  if (!file) return null;
  try {
    const mod = await loadModuleFresh(file);
    const cfg = mod.default && typeof mod.default === "object" ? mod.default : {};
    const type = mod.type ?? cfg.type ?? "fade";
    const out = { type };
    const duration = mod.duration ?? cfg.duration;
    if (duration) out.duration = Number(duration);
    return out;
  } catch {
    return null;
  }
}

async function resolvePrefetchConfig(segments) {
  const file = findRouteFileUp(segments || [], "prefetch");
  if (!file) return null;
  try {
    const mod = await loadModuleFresh(file);
    const cfg = mod.default && typeof mod.default === "object" ? mod.default : {};
    const strategy = mod.strategy ?? cfg.strategy ?? "hover";
    const out = { strategy };
    const margin = mod.margin ?? cfg.margin;
    if (margin) out.margin = String(margin);
    return out;
  } catch {
    return null;
  }
}

const pendingOverlayCache = new Map();
async function renderPendingOverlay(segments) {
  const file = findRouteFileUp(segments || [], "pending");
  if (!file) return "";
  try {
    let inner;
    const cached = pendingOverlayCache.get(file);
    if (cached && cached.gen === buildGeneration) {
      inner = cached.html;
    } else {
      const React = await loadAppReact();
      const mod = await loadModuleFresh(file);
      const Pending = mod.default ?? mod.Pending ?? mod.pending;
      if (!Pending) return "";
      inner = await renderToStringCompat(React.createElement(Pending, {}));
      pendingOverlayCache.set(file, { gen: buildGeneration, html: inner });
    }
    return `<div id="__sr-pending" data-sr-pending hidden style="position:fixed;top:0;left:0;right:0;z-index:2147483646;pointer-events:none">${inner}</div>`;
  } catch {
    return "";
  }
}

async function renderNotFound(segments) {
  const notFoundFile = findNotFound(segments);
  if (!notFoundFile) {
    return { status: 404, html: null, error: null, segments };
  }
  try {
    const React = await loadAppReact();
    const layouts = findLayoutsFor(segments || []);
    const mod = await loadModuleFresh(notFoundFile);
    const NotFound = mod.default ?? mod.NotFound ?? mod.notFound;
    if (!NotFound) {
      return { status: 404, html: null, error: null, segments };
    }
    let tree = React.createElement(NotFound);
    for (let i = layouts.length - 1; i >= 0; i--) {
      const layoutMod = await loadModuleFresh(layouts[i].file);
      const Layout = layoutMod.default ?? layoutMod.Layout ?? layoutMod.layout;
      if (Layout) tree = React.createElement(Layout, null, tree);
    }
    const html = await renderToStringCompat(tree);
    return { status: 404, html, metadata: null, error: null, pageFile: notFoundFile, layoutFiles: layouts.map((l) => l.file), segments };
  } catch (err) {
    return { status: 404, html: null, error: err, segments };
  }
}

function errorOverlayHTML(message, stack, extra) {
  return renderErrorOverlay({ message, stack, cwd, ...(extra || {}) });
}

function renderDevError({ err, context, pathname, pageFile, layoutFiles, errorFile }) {
  const diagnostic = logError(err, context, { pageFile, layoutFiles, errorFile });
  if (pathname) setIssue(`render:${pathname}`, diagnostic);
  broadcastHmr({ type: "error", message: diagnostic.title, diagnostic });
  return renderErrorOverlay({ diagnostic, cwd });
}

function listAppRoutes() {
  const routes = [];
  const walk = (dir, segs) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.isFile() && /^page\.(?:tsx|ts|jsx|js)$/.test(e.name))) routes.push(`/${segs.join("/")}`);
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".") || e.name.startsWith("@") || isPrivateDir(e.name)) continue;
      if (e.name === "node_modules" || parseInterceptSegment(e.name)) continue;
      const seg = /^\(.*\)$/.test(e.name) ? null : e.name.replace(/^%5F/i, "_");
      walk(join(dir, e.name), seg ? [...segs, seg] : segs);
    }
  };
  walk(APP_DIR, []);
  return routes;
}

function notFoundOverlay(pathname) {
  const spec = notFoundDiagnostic(pathname, { appDir: APP_DIR, routes: listAppRoutes(), cwd });
  return renderErrorOverlay({ diagnostic: diagnose({ diagnostic: spec }, { cwd }), cwd });
}

const DEV_INFO_DISABLED = process.env.SWIFT_RUST_BUILD === "1";
const RESTART_EXIT_CODE = 77;

function routeFileTree(pageFile) {
  if (!pageFile) return [];
  const leaf = dirname(pageFile);
  const rel = relative(APP_DIR, leaf);
  const dirs = [APP_DIR];
  if (rel && !rel.startsWith("..")) {
    let cur = APP_DIR;
    for (const part of rel.split(sep)) dirs.push((cur = join(cur, part)));
  } else if (rel) {
    dirs.push(leaf);
  }
  const out = [];
  for (const dir of dirs) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const ext = extname(e.name);
      if (!e.isFile() || !PAGE_EXTENSIONS.includes(ext)) continue;
      const kind = e.name.slice(0, -ext.length);
      if (kind === "page" ? dir !== leaf : !SPECIAL_FILES.has(kind)) continue;
      out.push({ kind, file: relative(cwd, join(dir, e.name)).split(sep).join("/") });
    }
  }
  return out;
}

function devInfoTag(pathname, renderResult, timings) {
  if (DEV_INFO_DISABLED) return "";
  const config = renderResult.config || {};
  const params = renderResult.params || {};
  const info = {
    version: VERSION,
    bun: typeof Bun !== "undefined" ? Bun.version : null,
    route: pathname,
    page: renderResult.pageFile ? relative(cwd, renderResult.pageFile).split(sep).join("/") : null,
    files: routeFileTree(renderResult.pageFile),
    runtime: config.runtime || "bun",
    render: renderResult.ppr ? "ppr" : config.static ? "static" : config.dynamic || Object.keys(params).length ? "dynamic" : "static",
    clientPage: Boolean(renderResult.clientPage),
    params,
    timings,
    root: cwd,
    appDir: relative(cwd, APP_DIR) || ".",
    devIndicators: loadGlobalConfig().devIndicators ?? true,
    supervised: process.env.SWIFT_RUST_SUPERVISED === "1",
  };
  return `<script type="application/json" id="__sr_dev_info">${JSON.stringify(info).replace(/</g, "\\u003c")}</script>`;
}

const GUI_EDITORS = [
  ["cursor", "goto"],
  ["code", "goto"],
  ["windsurf", "goto"],
  ["code-insiders", "goto"],
  ["codium", "goto"],
  ["zed", "colon"],
  ["subl", "colon"],
  ["webstorm", "jetbrains"],
  ["idea", "jetbrains"],
];
const TERMINAL_EDITORS = new Set(["vi", "vim", "nvim", "nano", "emacs", "ed", "micro", "hx"]);

function detectEditor() {
  const configured = process.env.SWIFT_RUST_EDITOR || process.env.REACT_EDITOR || process.env.VISUAL || process.env.EDITOR;
  if (configured) {
    const bin = configured.trim().split(/\s+/)[0];
    const name = basename(bin);
    if (!TERMINAL_EDITORS.has(name)) {
      return { bin, name, style: GUI_EDITORS.find(([n]) => n === name)?.[1] || "colon" };
    }
  }
  const which = typeof Bun !== "undefined" && typeof Bun.which === "function" ? Bun.which : () => null;
  for (const [name, style] of GUI_EDITORS) {
    const bin = which(name);
    if (bin) return { bin, name, style };
  }
  return null;
}

function openInEditor(file, line = 1, column = 1) {
  if (!file) return { ok: false, error: "Missing file" };
  const abs = resolve(cwd, file);
  if (!(abs === cwd || abs.startsWith(`${cwd}${sep}`)) || !existsSync(abs)) {
    return { ok: false, error: `Refusing to open ${file}: it is not a file inside the project` };
  }
  const editor = detectEditor();
  const args = !editor
    ? [abs]
    : editor.style === "goto"
      ? ["-g", `${abs}:${line}:${column}`]
      : editor.style === "jetbrains"
        ? ["--line", String(line), "--column", String(column), abs]
        : [`${abs}:${line}:${column}`];
  const bin = editor?.bin || (process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open");
  try {
    spawn(bin, args, { detached: true, stdio: "ignore" }).unref();
    return { ok: true, editor: editor?.name || "the default app" };
  } catch (err) {
    return { ok: false, error: `Could not launch ${bin}: ${err.message}. Set SWIFT_RUST_EDITOR to your editor's command.` };
  }
}

function clearAllCaches() {
  buildGeneration++;
  moduleCache.clear();
  ssrBundleCache.clear();
  componentIslandCache.clear();
  islandBundleCache.clear();
  pendingOverlayCache.clear();
  lastCompiledAt.clear();
  globalsCssCache = { file: null, mtime: 0, css: "" };
  fontsScannedFromLayout = false;
  GOOGLE_FONT_FAMILIES.clear();
  const store = globalThis.__SR_CACHE__;
  const purged = store?.store?.size || 0;
  store?.store?.clear();
  return purged;
}

async function devApi(method, url) {
  const p = url.pathname;
  if (p === "/_swift-rust/issues") return Response.json([...devIssues.values()]);
  if (p === "/_swift-rust/open-editor") {
    const result = openInEditor(
      url.searchParams.get("file"),
      Number(url.searchParams.get("line")) || 1,
      Number(url.searchParams.get("column")) || 1,
    );
    return Response.json(result, { status: result.ok ? 200 : 400 });
  }
  if (p === "/_swift-rust/clear-cache") {
    if (method !== "POST") return Response.json({ error: "use POST" }, { status: 405 });
    const purged = clearAllCaches();
    logLine([` ${paint("magenta", "↻")} ${paint("dim", "Caches cleared from the dev toolbar")}`]);
    broadcastHmr({ type: "reload", reason: "cache-cleared", at: Date.now() });
    return Response.json({ ok: true, purged });
  }
  if (p === "/_swift-rust/restart") {
    if (method !== "POST") return Response.json({ error: "use POST" }, { status: 405 });
    if (process.env.SWIFT_RUST_SUPERVISED !== "1") {
      return Response.json(
        { ok: false, error: "Restarting needs the swift-rust CLI. Start the server with `swift-rust dev`." },
        { status: 409 },
      );
    }
    logLine([`\n ${paint("yellow", "↻")} ${paint("bold", "Restarting dev server")} ${paint("dim", "(requested from the dev toolbar)")}\n`]);
    setTimeout(() => process.exit(RESTART_EXIT_CODE), 50);
    return Response.json({ ok: true });
  }
  return null;
}

// Metadata icon files looked up at the root of the app directory (app/ or
// app/src/), Next.js App Router style. Found files are served from the site
// root and auto-linked in <head>.
const APP_ICON_FILES = ["favicon.ico", "favicon.svg", "icon.svg", "icon.png", "apple-icon.png"];

function discoverAppIcons() {
  const icons = [];
  for (const name of APP_ICON_FILES) {
    const file = join(APP_DIR, name);
    if (existsSync(file) && statSync(file).isFile()) icons.push({ name, file });
  }
  return icons;
}

function buildAppIconsLinkTags() {
  return discoverAppIcons()
    .map(({ name }) => {
      const ext = extname(name).toLowerCase();
      if (name.startsWith("apple-icon")) return `<link rel="apple-touch-icon" href="/${name}" />`;
      if (ext === ".ico") return `<link rel="icon" href="/${name}" sizes="any" />`;
      if (ext === ".svg") return `<link rel="icon" href="/${name}" type="image/svg+xml" />`;
      return `<link rel="icon" href="/${name}" />`;
    })
    .join("\n");
}

async function buildHead(head) {
  const css = await getProcessedGlobalsCss();
  const fontLink = buildGoogleFontsLinkTag();
  const localFontStyles = buildLocalFontsStyleTag();
  return [
    head || "",
    buildAppIconsLinkTags(),
    fontLink,
    localFontStyles,
    css ? `<style data-swift-rust-globals>${escapeForStyleTag(css)}</style>` : "",
  ].filter(Boolean).join("\n");
}

function wrapInDocument({ head, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${head || ""}
<script src="/_swift-rust/hmr-client.js" defer></script>
</head>
<body>${body}</body>
</html>`;
}

async function wrapInDocumentAsync({ head, body }) {
  const fullHead = await buildHead(head);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${fullHead}
<script src="/_swift-rust/navigator.js" defer></script>
<script src="/_swift-rust/hmr-client.js" defer></script>
</head>
<body>${body}</body>
</html>`;
}

async function tryHmrClient() {
  try {
    const file = join(dirname(new URL(import.meta.url).pathname), "runtime", "hmr-client.js");
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function readNavigatorClient() {
  try {
    const file = join(dirname(new URL(import.meta.url).pathname), "runtime", "navigator.js");
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

const WATCH_IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "target",
]);

// Ignore anything inside a dep/build dir, any dot-prefixed path segment (which
// also covers our own .__sr_* build temps and dirs like .git/.turbo/.next),
// and editor scratch suffixes.
function isIgnoredWatchPath(full) {
  const rel = relative(cwd, full);
  if (!rel || rel.startsWith("..")) return true;
  const parts = rel.split(sep);
  for (const p of parts) {
    if (!p || p.startsWith(".")) return true;
    if (WATCH_IGNORE_DIRS.has(p)) return true;
  }
  const base = parts[parts.length - 1];
  if (base.endsWith(".bak") || base.endsWith(".tmp") || base.endsWith("~")) return true;
  return false;
}

const SYNTAX_CHECK_LOADERS = { ".ts": "ts", ".tsx": "tsx", ".js": "js", ".jsx": "jsx", ".mjs": "js" };

// Quick transpile of the changed sources before telling the browser to reload.
// Editors save in stages (truncate+write, format-on-save), so the first FS
// event often fires mid-write; compiling that state used to navigate every tab
// into a dead 500 page. A failed check retries once after a beat (to skate
// over partial writes); a persistent failure is a real syntax error.
async function findSyntaxError(files) {
  if (typeof Bun === "undefined" || typeof Bun.Transpiler !== "function") return null;
  for (const file of files) {
    const loader = SYNTAX_CHECK_LOADERS[extname(file)];
    if (!loader) continue;
    for (let attempt = 0; ; attempt++) {
      let src;
      try {
        src = readFileSync(file, "utf8");
      } catch {
        break; // deleted — nothing to check
      }
      try {
        new Bun.Transpiler({ loader }).transformSync(src);
        break;
      } catch (err) {
        if (attempt >= 1) {
          const first = err?.errors?.[0] ?? err;
          const message = first?.message || String(first);
          const position = first?.position ? { ...first.position, file } : { file, line: 1, column: 1, length: 0 };
          return diagnose({ name: "SyntaxError", message, position }, { cwd, context: "while compiling" });
        }
        await new Promise((r) => setTimeout(r, 150));
      }
    }
  }
  return null;
}

function broadcastHmr(data) {
  const payload = JSON.stringify({ event: "change", data });
  for (const send of hmrClients) {
    try {
      send(payload);
    } catch {}
  }
}

function setupWatcher() {
  if (!existsSync(APP_DIR)) return;
  const watchers = new Map();
  let recursiveMode = false;

  // ── Debounced batch flush ──────────────────────────────────────────────────
  // All events funnel into one pending set; a flush invalidates caches once,
  // syntax-checks the batch, and broadcasts a single reload (or error).
  const pendingFiles = new Set();
  let pendingWildcard = false; // event with no usable filename → invalidate broadly
  let flushTimer = null;
  let flushing = false;
  let lastFlushErrored = false;

  function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, 80);
  }

  function noteChange(full) {
    pendingFiles.add(full);
    scheduleFlush();
  }

  function noteWildcard() {
    pendingWildcard = true;
    scheduleFlush();
  }

  async function flush() {
    if (flushing) {
      scheduleFlush();
      return;
    }
    flushing = true;
    try {
      const files = [...pendingFiles];
      pendingFiles.clear();
      const wildcard = pendingWildcard;
      pendingWildcard = false;
      if (!files.length && !wildcard) return;

      buildGeneration++;
      for (const full of files) {
        logEvent("change", full);
        bustCache(full);
        if (full.endsWith(`${sep}layout.tsx`) || full.endsWith(`${sep}layout.ts`)) {
          fontsScannedFromLayout = false;
          GOOGLE_FONT_FAMILIES.clear();
        }
      }
      // Any source edit can introduce new utility classes (Tailwind scans the
      // source tree), so re-run the CSS pipeline on every flush — not only when
      // globals.css itself changes. mtime caching keeps subsequent requests hot.
      globalsCssCache = { file: null, mtime: 0, css: "" };
      if (wildcard) {
        fontsScannedFromLayout = false;
        GOOGLE_FONT_FAMILIES.clear();
      }

      const syntaxError = await findSyntaxError(files);
      if (syntaxError) {
        // Overlay on the live page instead of reloading into a dead 500 —
        // page state survives, and the next clean save reloads normally.
        lastFlushErrored = true;
        setIssue("syntax", syntaxError);
        logDiagnostic(syntaxError);
        broadcastHmr({ type: "error", message: syntaxError.title, diagnostic: syntaxError });
        return;
      }
      clearIssue("syntax");
      clearIssuesWithPrefix("render:");
      clearIssuesWithPrefix("island:");
      if (lastFlushErrored) {
        lastFlushErrored = false;
        broadcastHmr({ type: "ok" });
      }
      broadcastHmr({ type: "reload", file: relative(cwd, files[0] ?? cwd), at: Date.now() });
      logHmr(files[0] ?? cwd);
    } finally {
      flushing = false;
      if (pendingFiles.size || pendingWildcard) scheduleFlush();
    }
  }

  function handleEvent(full) {
    try {
      if (statSync(full).isDirectory()) {
        // New directory: in fallback mode start watching it. Files may have
        // been created inside it before the watcher attached, so invalidate
        // broadly instead of silently dropping the event (the old behavior —
        // one dropped event meant stale renders until the server restarted).
        if (!recursiveMode) walk(full);
        noteWildcard();
        return;
      }
    } catch {}
    noteChange(full);
  }

  function onWatchEvent(baseDir) {
    return (event, filename) => {
      if (!filename) {
        // macOS/FSEvents can coalesce events and drop the filename. Treat it
        // as "something changed" rather than ignoring it.
        noteWildcard();
        return;
      }
      const full = join(baseDir, filename.toString());
      if (isIgnoredWatchPath(full)) return;
      handleEvent(full);
    };
  }

  // Fallback: one watcher per directory (non-recursive platforms).
  function walk(dir) {
    if (watchers.has(dir)) return;
    // A probe child path tells us whether the directory itself is ignored
    // (cwd resolves to rel "x", which passes).
    if (isIgnoredWatchPath(join(dir, "x"))) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith(".") && !WATCH_IGNORE_DIRS.has(e.name)) {
          walk(join(dir, e.name));
        }
      }
      const w = fsWatch(dir, onWatchEvent(dir));
      watchers.set(dir, w);
    } catch (err) {
      logLine([` ${paint("dim", "watch error:")} ${paint("red", err.message)}`], 1);
    }
  }

  // Watch the WHOLE project (minus dep/build dirs) so a change to *any* source
  // file — pages, components, lib, hooks, content, config, wherever — triggers
  // a recompile + reload. Prefer a single recursive watcher (macOS, Windows,
  // Linux on Node 20+/Bun): hundreds of per-directory FSEvents watchers could
  // hit OS limits and die silently, leaving saves unnoticed until a restart.
  try {
    const w = fsWatch(cwd, { recursive: true }, onWatchEvent(cwd));
    watchers.set(cwd, w);
    recursiveMode = true;
  } catch {
    walk(cwd);
  }
}

const networkUrls = [];
async function detectNetworkUrls() {
  const { networkInterfaces } = await import("node:os");
  let ifaces;
  try {
    ifaces = networkInterfaces();
  } catch {
    return;
  }
  for (const list of Object.values(ifaces)) {
    for (const iface of list || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        networkUrls.push(`http://${iface.address}:${port}`);
      }
    }
  }
}

async function checkAppDir() {
  if (!existsSync(APP_DIR)) {
    logDiagnostic(diagnose({ diagnostic: noAppDirDiagnostic(cwd) }, { cwd }));
    process.exit(1);
  }
}

function actionErrorResponse(spec) {
  const diagnostic = logDiagnostic(diagnose({ diagnostic: spec }, { cwd, context: "while running a server action" }));
  return Response.json(
    { ok: false, error: diagnostic.title, code: diagnostic.code, help: diagnostic.helps?.map((h) => h.message) ?? [], docs: diagnostic.docs },
    { status: 404 },
  );
}

async function handleServerAction(req) {
  const parsed = await parseActionRequest(req);
  if (parsed.error) return parsed.error;
  const { actionId, filePart, exportName } = parsed;

  let targetFile = null;
  const candidates = [
    filePart,
    join(cwd, filePart),
    join(APP_DIR, filePart),
    join(cwd, "src", filePart),
    join(cwd, "src", "app", filePart),
  ];
  for (const c of candidates) {
    if (!c) continue;
    for (const ext of ["", ".ts", ".tsx", ".js", ".mjs"]) {
      const p = c + ext;
      try {
        if (existsSync(p) && statSync(p).isFile()) {
          targetFile = p;
          break;
        }
      } catch {}
    }
    if (targetFile) break;
  }

  if (!targetFile) {
    const defaultActions = [
      join(APP_DIR, "actions.ts"),
      join(APP_DIR, "actions.tsx"),
      join(APP_DIR, "actions.js"),
      join(cwd, "src", "actions.ts"),
      join(cwd, "actions.ts"),
    ];
    for (const a of defaultActions) {
      if (existsSync(a) && statSync(a).isFile()) {
        targetFile = a;
        break;
      }
    }
  }

  if (!targetFile) {
    return actionErrorResponse({
      code: "SR0048",
      kind: "runtime",
      title: `server action module ${"`"}${filePart || actionId}${"`"} not found`,
      notes: [`looked in ${"`"}${relative(cwd, APP_DIR) || "."}${"`"}, ${"`"}src/${"`"} and the project root`],
      helps: [
        { message: "make sure the action id is `path/to/file#exportName`, relative to the project root" },
        { message: "or put shared actions in `app/actions.ts`, which is used when no module is given" },
      ],
    });
  }

  try {
    const mod = await loadModuleFresh(targetFile);
    const fn = actionExport(mod, exportName);
    if (typeof fn !== "function") return actionErrorResponse(serverActionNotFoundDiagnostic(exportName, targetFile, cwd));
    return await runServerAction(fn, parsed, req);
  } catch (err) {
    return Response.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}

let serverHandle = null;

async function handleRequest(req, res) {
  const reqStart = performance.now();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method || "GET";

  if (pathname === "/_swift-rust/hmr") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(": ping\n\n");
    const send = (data) => res.write(`data: ${data}\n\n`);
    hmrClients.add(send);
    const ping = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        clearInterval(ping);
      }
    }, 15000);
    req.on("close", () => {
      hmrClients.delete(send);
      clearInterval(ping);
    });
    return;
  }

  if (pathname === "/sw.js" || pathname === "/sw.js.map") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (
    pathname === "/_vercel/insights/script.js" ||
    pathname === "/_vercel/speed-insights/script.js" ||
    pathname.startsWith("/_vercel/")
  ) {
    res.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end("/* Vercel Analytics dev stub (active in production on Vercel) */\n");
    return;
  }

  if (pathname === "/_swift-rust/info") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(devServerInfo()));
    return;
  }

  if (pathname === "/_swift-rust/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", version: VERSION }));
    return;
  }

  {
    const api = await devApi(method, url);
    if (api) {
      res.writeHead(api.status, Object.fromEntries(api.headers));
      res.end(await api.text());
      return;
    }
  }

  if (pathname === "/_swift-rust/action" || (req.method === "POST" && (req.headers["x-action-id"] || req.headers["next-action"]))) {
    const proto = req.socket?.encrypted ? "https" : "http";
    const fullUrl = `${proto}://${req.headers.host || "localhost"}${req.url}`;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyBuf = Buffer.concat(chunks);
    const webReq = new Request(fullUrl, {
      method: req.method,
      headers: req.headers,
      body: req.method !== "GET" && req.method !== "HEAD" && bodyBuf.length ? bodyBuf : undefined,
      duplex: "half",
    });
    const webRes = await handleServerAction(webReq);
    res.statusCode = webRes.status;
    webRes.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(await webRes.text());
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  if (pathname === "/_swift-rust/hmr-client.js") {
    const client = await tryHmrClient();
    if (client) {
      res.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-store" });
      res.end(client);
      return;
    }
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  if (pathname.startsWith("/_swift-rust/fonts/")) {
    const fontPath = resolveLocalFontPath(pathname);
    if (fontPath && existsSync(fontPath) && statSync(fontPath).isFile()) {
      const ext = extname(fontPath).toLowerCase();
      const mime = { ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf" }[ext] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime, "Cache-Control": "public, max-age=31536000, immutable" });
      res.end(readFileSync(fontPath));
      return;
    }
    res.writeHead(404);
    res.end("Font not found");
    return;
  }

  if (pathname === "/_swift-rust/image") {
    const target = url.searchParams.get("url");
    const w = parseInt(url.searchParams.get("w") || "0", 10);
    if (!target) {
      res.writeHead(400);
      res.end("Missing url");
      return;
    }
    const decoded = decodeURIComponent(target);
    if (existsSync(PUBLIC_DIR)) {
      const safe = decoded.replace(/\.\.+/g, "").replace(/^\/+/, "");
      const candidate = join(PUBLIC_DIR, safe);
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        const ext = extname(candidate).toLowerCase();
        const mime = MIME[ext] || "application/octet-stream";
        const buf = readFileSync(candidate);
        res.writeHead(200, {
          "Content-Type": mime,
          "Cache-Control": "public, max-age=3600",
          "X-Swift-Rust-Image-Optimization": "passthrough",
          ...(w > 0 ? { "X-Swift-Rust-Image-Width": String(w) } : {}),
        });
        res.end(buf);
        return;
      }
    }
    res.writeHead(404);
    res.end("Image not found");
    return;
  }

  if (pathname.startsWith("/_swift-rust/")) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  if (pathname.startsWith("/_static/") || pathname.startsWith("/__swift-rust/")) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  // App-directory metadata icons (app/favicon.ico, app/icon.svg, …) served
  // from the site root, Next.js style.
  {
    const iconName = pathname.replace(/^\/+/, "");
    if (APP_ICON_FILES.includes(iconName)) {
      const candidate = join(APP_DIR, iconName);
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        const ext = extname(candidate).toLowerCase();
        const mime = { ".ico": "image/x-icon", ".svg": "image/svg+xml", ".png": "image/png" }[ext] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": mime });
        res.end(readFileSync(candidate));
        return;
      }
    }
  }

  if (existsSync(PUBLIC_DIR)) {
    const safe = pathname.replace(/\.\.+/g, "").replace(/^\/+/, "");
    const candidate = join(PUBLIC_DIR, safe);
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      const ext = extname(candidate).toLowerCase();
      const mime = {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif",
        ".svg": "image/svg+xml", ".ico": "image/x-icon",
        ".css": "text/css", ".js": "application/javascript", ".mjs": "application/javascript",
        ".json": "application/json", ".txt": "text/plain", ".woff": "font/woff",
        ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
        ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg",
      }[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      res.end(readFileSync(candidate));
      return;
    }
  }

  const compileStart = performance.now();
  const compileResult = await compileRoute(pathname, req);
  const compileMs = performance.now() - compileStart;

  if (compileResult.ok && !compileResult.cached) {
    logCompile(pathname, compileMs);
  }

  if (!compileResult.ok) {
    if (compileResult.reason === "not_found") {
      const total = performance.now() - reqStart;
      logRequest({ method, url: pathname, status: 404, duration: total, compileMs: 0 });
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end(`404 not found: ${pathname}`);
      return;
    }
    if (compileResult.reason === "compile_error") {
      const overlay = renderDevError({
        err: compileResult.error,
        context: `while compiling ${pathname}`,
        pathname,
        pageFile: compileResult.pageFile,
        layoutFiles: compileResult.layoutFile ? [compileResult.layoutFile] : [],
      });
      const total = performance.now() - reqStart;
      logRequest({ method, url: pathname, status: 500, duration: total, compileMs });
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(overlay);
      return;
    }
  }

  const renderStart = performance.now();
  const renderResult = await renderRoute(pathname, req);
  const renderMs = performance.now() - renderStart;
  const total = performance.now() - reqStart;

  if (renderResult.status === 500) {
    const overlay = renderDevError({
      err: renderResult.error,
      context: `while rendering ${pathname}`,
      pathname,
      pageFile: renderResult.pageFile,
      layoutFiles: renderResult.layoutFiles,
      errorFile: renderResult.errorFile,
    });
    logRequest({ method, url: pathname, status: 500, duration: total, compileMs });
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(overlay);
    return;
  }

  if (renderResult.status === 404) {
    logRequest({ method, url: pathname, status: 404, duration: total, compileMs: 0 });
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(notFoundOverlay(pathname));
    return;
  }

  clearIssue(`render:${pathname}`);
  logRequest({ method, url: pathname, status: 200, duration: total, compileMs });
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Server-Timing": serverTiming({ compile: compileMs, render: renderMs, total }),
  });
  const doc = await wrapInDocumentAsync({ head: "", body: renderResult.html || "" });
  res.end(doc.replace("</body>", `${devInfoTag(pathname, renderResult, { compile: compileMs, render: renderMs, total })}</body>`));
}

function islandErrorResponse(err, file, context) {
  const diagnostic = logError(err, context, { pageFile: file });
  setIssue(`island:${file}`, diagnostic);
  broadcastHmr({ type: "error", message: diagnostic.title, diagnostic });
  return new Response(`/* error[${diagnostic.code}]: ${String(diagnostic.title).replace(/\*\//g, "* /")} */`, {
    status: 500,
    headers: { "Content-Type": "application/javascript; charset=utf-8" },
  });
}

function serverTiming({ compile, render, total }) {
  return [
    `compile;dur=${compile.toFixed(1)};desc="Compile"`,
    `render;dur=${render.toFixed(1)};desc="Render"`,
    `total;dur=${total.toFixed(1)};desc="Total"`,
  ].join(", ");
}

function devServerInfo() {
  return {
    version: VERSION,
    bun: typeof Bun !== "undefined" ? Bun.version : null,
    appDir: relative(cwd, APP_DIR),
    root: cwd,
    port,
    uptime: Date.now() - bootTime,
    supervised: process.env.SWIFT_RUST_SUPERVISED === "1",
    issues: devIssues.size,
    devIndicators: loadGlobalConfig().devIndicators ?? true,
  };
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

let instrumentationMod = null;

async function handleFetch(req) {
  const reqStart = performance.now();
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method || "GET";

  if (pathname === "/_swift-rust/hmr") {
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(enc.encode(": ping\n\n"));
        const send = (data) => controller.enqueue(enc.encode(`data: ${data}\n\n`));
        hmrClients.add(send);
        const ping = setInterval(() => {
          try {
            controller.enqueue(enc.encode(": ping\n\n"));
          } catch {
            clearInterval(ping);
            hmrClients.delete(send);
          }
        }, 15000);
        req.signal?.addEventListener("abort", () => {
          hmrClients.delete(send);
          clearInterval(ping);
          try {
            controller.close();
          } catch {}
        });
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  if (pathname === "/sw.js" || pathname === "/sw.js.map") {
    return new Response(null, { status: 204 });
  }

  if (
    pathname === "/_vercel/insights/script.js" ||
    pathname === "/_vercel/speed-insights/script.js" ||
    pathname.startsWith("/_vercel/")
  ) {
    return new Response("/* Vercel Analytics dev stub (active in production on Vercel) */\n", {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  if (pathname === "/_swift-rust/info") {
    return Response.json(devServerInfo());
  }

  if (pathname === "/_swift-rust/health") {
    return Response.json({ status: "ok", version: VERSION });
  }

  {
    const api = await devApi(req.method, url);
    if (api) return api;
  }

  if (pathname === "/_swift-rust/action" || (req.method === "POST" && (req.headers.get("x-action-id") || req.headers.get("next-action")))) {
    return await handleServerAction(req);
  }

  if (pathname === "/robots.txt") {
    const robotsFile = findFile(APP_DIR, "robots") || (existsSync(join(APP_DIR, "robots.txt")) ? join(APP_DIR, "robots.txt") : null);
    if (robotsFile) {
      if (robotsFile.endsWith(".txt")) {
        return new Response(readFileSync(robotsFile, "utf8"), {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      try {
        const mod = await loadModuleFresh(robotsFile);
        const fn = mod.default ?? mod.robots;
        const data = typeof fn === "function" ? await fn() : (mod.default ?? mod.robots ?? mod);
        return new Response(serializeRobots(data), {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      } catch (err) {
        return new Response(String(err?.stack || err), { status: 500 });
      }
    }
  }

  if (pathname === "/sitemap.xml") {
    const sitemapFile = findFile(APP_DIR, "sitemap") || (existsSync(join(APP_DIR, "sitemap.xml")) ? join(APP_DIR, "sitemap.xml") : null);
    if (sitemapFile) {
      if (sitemapFile.endsWith(".xml")) {
        return new Response(readFileSync(sitemapFile, "utf8"), {
          headers: { "Content-Type": "application/xml; charset=utf-8" },
        });
      }
      try {
        const mod = await loadModuleFresh(sitemapFile);
        const fn = mod.default ?? mod.sitemap;
        const data = typeof fn === "function" ? await fn() : (mod.default ?? mod.sitemap ?? mod);
        return new Response(serializeSitemap(data), {
          headers: { "Content-Type": "application/xml; charset=utf-8" },
        });
      } catch (err) {
        return new Response(String(err?.stack || err), { status: 500 });
      }
    }
  }

  if (pathname === "/_swift-rust/hmr-client.js") {
    const client = await tryHmrClient();
    if (client) {
      return new Response(client, { headers: { "Content-Type": "application/javascript", "Cache-Control": "no-store" } });
    }
    return new Response("Not found", { status: 404 });
  }

  if (pathname.startsWith("/_swift-rust/fonts/")) {
    const fontPath = resolveLocalFontPath(pathname);
    if (fontPath && existsSync(fontPath) && statSync(fontPath).isFile()) {
      const ext = extname(fontPath).toLowerCase();
      const mime = { ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf" }[ext] ?? "application/octet-stream";
      const file = Bun?.file ? Bun.file(fontPath) : readFileSync(fontPath);
      return new Response(file, {
        headers: {
          "Content-Type": mime,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
    return new Response("Font not found", { status: 404 });
  }

  if (pathname === "/_swift-rust/navigator.js") {
    const client = readNavigatorClient();
    if (client) {
      return new Response(client, { headers: { "Content-Type": "application/javascript; charset=utf-8" } });
    }
    return new Response("// navigator unavailable", { status: 404, headers: { "Content-Type": "application/javascript" } });
  }

  if (pathname === "/_swift-rust/image") {
    const target = url.searchParams.get("url");
    const w = parseInt(url.searchParams.get("w") || "0", 10);
    if (!target) return new Response("Missing url", { status: 400 });
    const decoded = decodeURIComponent(target);
    if (existsSync(PUBLIC_DIR)) {
      const safe = decoded.replace(/\.\.+/g, "").replace(/^\/+/, "");
      const candidate = join(PUBLIC_DIR, safe);
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        const ext = extname(candidate).toLowerCase();
        const mime = MIME[ext] || "application/octet-stream";
        const file = Bun?.file ? Bun.file(candidate) : readFileSync(candidate);
        const headers = {
          "Content-Type": mime,
          "Cache-Control": "public, max-age=3600",
          "X-Swift-Rust-Image-Optimization": "passthrough",
          ...(w > 0 ? { "X-Swift-Rust-Image-Width": String(w) } : {}),
        };
        const total = performance.now() - reqStart;
        logRequest({ method, url: pathname, status: 200, duration: total, compileMs: 0 });
        return new Response(file, { headers });
      }
    }
    return new Response("Image not found", { status: 404 });
  }

  // Client-island hydration bundle for a "use client" page.
  if (pathname === "/_swift-rust/island.js") {
    const p = url.searchParams.get("p");
    if (p && existsSync(p)) {
      try {
        const code = await buildIslandBundle(p);
        clearIssue(`island:${p}`);
        return new Response(code, {
          headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache" },
        });
      } catch (e) {
        return islandErrorResponse(e, p, "while bundling the client page");
      }
    }
    return new Response("// island not found", { status: 404, headers: { "Content-Type": "application/javascript" } });
  }

  // Per-component client-island bundle (self-mounting; hydrates its markers).
  if (pathname === "/_swift-rust/island-comp.js") {
    const p = url.searchParams.get("p");
    if (p && existsSync(p)) {
      try {
        const code = await buildComponentIslandBundle(p);
        clearIssue(`island:${p}`);
        return new Response(code, {
          headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache" },
        });
      } catch (e) {
        return islandErrorResponse(e, p, "while bundling the client component");
      }
    }
    return new Response("// island not found", { status: 404, headers: { "Content-Type": "application/javascript" } });
  }

  // On-demand revalidation: POST /_swift-rust/revalidate { tag?, path? }
  // Purges the shared data cache (globalThis.__SR_CACHE__) by tag or path so
  // webhooks / mutations can invalidate without a redeploy.
  if (pathname === "/_swift-rust/revalidate") {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "use POST" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }
    let body = {};
    try { body = await req.json(); } catch {}
    const tag = body.tag ?? url.searchParams.get("tag");
    const path = body.path ?? url.searchParams.get("path");
    const store = globalThis.__SR_CACHE__;
    let purged = 0;
    if (store?.store) {
      for (const [k, v] of store.store) {
        if ((tag && v.tags?.includes(tag)) || (path && k.includes(path))) {
          store.store.delete(k);
          purged++;
        }
      }
      if (tag) store.purged?.add(`tag:${tag}`);
      if (path) store.purged?.add(`path:${path}`);
    }
    return Response.json({ revalidated: true, tag: tag ?? null, path: path ?? null, purged });
  }

  if (pathname.startsWith("/_swift-rust/")) {
    return new Response("Not found", { status: 404 });
  }

  // App-directory metadata icons (app/favicon.ico, app/favicon.svg, …) served
  // from the site root, Next.js style.
  {
    const iconName = pathname.replace(/^\/+/, "");
    if (APP_ICON_FILES.includes(iconName)) {
      const candidate = join(APP_DIR, iconName);
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        const ext = extname(candidate).toLowerCase();
        const mime =
          { ".ico": "image/x-icon", ".svg": "image/svg+xml", ".png": "image/png" }[ext] ||
          "application/octet-stream";
        const file = Bun?.file ? Bun.file(candidate) : readFileSync(candidate);
        logRequest({ method, url: pathname, status: 200, duration: performance.now() - reqStart, compileMs: 0 });
        return new Response(file, { headers: { "Content-Type": mime } });
      }
    }
  }

  if (existsSync(PUBLIC_DIR)) {
    const safe = pathname.replace(/\.\.+/g, "").replace(/^\/+/, "");
    const candidate = join(PUBLIC_DIR, safe);
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      const ext = extname(candidate).toLowerCase();
      const mime = MIME[ext] || "application/octet-stream";
      const file = Bun?.file ? Bun.file(candidate) : readFileSync(candidate);
      const total = performance.now() - reqStart;
      logRequest({ method, url: pathname, status: 200, duration: total, compileMs: 0 });
      return new Response(file, { headers: { "Content-Type": mime } });
    }
  }

  const segments = urlToRouteSegments(pathname);
  if (segments[0] === "api") {
    return await handleApiRoute(req, segments, method, reqStart);
  }

  // rpc.ts / stream.ts handlers (leaf, route.ts-like).
  {
    const leaf = resolveLeafDir(segments);
    if (leaf) {
      const sp = Object.fromEntries(url.searchParams.entries());
      const baseCtx = buildRouteCtx(req, url, leaf.params, sp);
      const rpcFile = findFile(leaf.dir, "rpc");
      if (rpcFile) {
        try {
          const mod = await loadModuleFresh(rpcFile);
          const procs = mod.procedures ?? mod.default;
          if (procs && typeof procs === "object") {
            if (method === "POST") {
              const body = await req.json().catch(() => ({}));
              const proc = procs[body.procedure];
              if (!proc) return jsonResponse({ error: `Unknown procedure: ${body.procedure}` }, 404);
              let input = body.input;
              if (proc.input?.safeParse) {
                const r = proc.input.safeParse(input);
                if (!r.success) return jsonResponse({ error: "Invalid input", issues: r.error?.issues ?? r.error }, 400);
                input = r.data;
              }
              return jsonResponse({ data: await proc.handler(input, baseCtx) });
            }
            if (method === "GET") return jsonResponse({ procedures: Object.keys(procs) });
          }
        } catch (e) {
          return jsonResponse({ error: String(e?.message || e) }, 500);
        }
      }
      const streamFile = findFile(leaf.dir, "stream");
      if (streamFile && !findFile(leaf.dir, "page")) {
        try {
          const mod = await loadModuleFresh(streamFile);
          const fn = mod.default ?? mod.stream;
          if (typeof fn === "function") {
            const result = await fn(baseCtx);
            if (result instanceof Response) return result;
            return new Response(result, {
              headers: { "Content-Type": mod.contentType || "text/event-stream", "Cache-Control": "no-cache" },
            });
          }
        } catch (e) {
          return new Response(String(e?.message || e), { status: 500 });
        }
      }
    }
  }

  // Non-GET requests are allowed to reach the page render so action.ts can run;
  // pages without an action simply ignore the body.
  const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);
  if (!ALLOWED_METHODS.has(method)) {
    return new Response("Method not allowed", { status: 405 });
  }

  const compileStart = performance.now();
  const compileResult = await compileRoute(pathname, req);
  const compileMs = performance.now() - compileStart;

  if (compileResult.ok && !compileResult.cached) {
    logCompile(pathname, compileMs);
  }

  if (!compileResult.ok) {
    if (compileResult.reason === "not_found") {
      const notFoundResult = await renderNotFound(segments);
      const total = performance.now() - reqStart;
      const status = notFoundResult.html ? 404 : 404;
      logRequest({ method, url: pathname, status, duration: total, compileMs: 0 });
      if (notFoundResult.html) {
        return new Response(await wrapInDocumentAsync({ head: "", body: notFoundResult.html }), {
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      return new Response(notFoundOverlay(pathname), {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    if (compileResult.reason === "compile_error") {
      const overlay = renderDevError({
        err: compileResult.error,
        context: `while compiling ${pathname}`,
        pathname,
        pageFile: compileResult.pageFile,
        layoutFiles: compileResult.layoutFile ? [compileResult.layoutFile] : [],
      });
      const total = performance.now() - reqStart;
      logRequest({ method, url: pathname, status: 500, duration: total, compileMs });
      return new Response(overlay, { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
  }

  const renderStart = performance.now();
  const renderResult = await renderRoute(pathname, req);
  const renderMs = performance.now() - renderStart;
  const total = performance.now() - reqStart;

  if (renderResult.status === 500) {
    const overlay = renderDevError({
      err: renderResult.error,
      context: `while rendering ${pathname}`,
      pathname,
      pageFile: renderResult.pageFile,
      layoutFiles: renderResult.layoutFiles,
      errorFile: renderResult.errorFile,
    });
    logRequest({ method, url: pathname, status: 500, duration: total, compileMs });
    return new Response(overlay, { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  if (renderResult.status === 404) {
    logRequest({ method, url: pathname, status: 404, duration: total, compileMs: 0 });
    if (renderResult.html) {
      return new Response(await wrapInDocumentAsync({ head: "", body: renderResult.html }), {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return new Response(notFoundOverlay(pathname), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  clearIssue(`render:${pathname}`);

  if (renderResult.redirect) {
    logRequest({ method, url: pathname, status: renderResult.status, duration: total, compileMs });
    const rh = new Headers({ Location: renderResult.redirect });
    for (const c of renderResult.setCookies || []) rh.append("Set-Cookie", c);
    return new Response(null, { status: renderResult.status, headers: rh });
  }

  // Raw Response from a guard/action (RouteControl response, 401, 403, …).
  if (renderResult.rawResponse instanceof Response) {
    logRequest({ method, url: pathname, status: renderResult.rawResponse.status, duration: total, compileMs });
    const r = renderResult.rawResponse;
    for (const c of renderResult.setCookies || []) r.headers.append("Set-Cookie", c);
    return r;
  }

  logRequest({ method, url: pathname, status: 200, duration: total, compileMs });
  await scanFontsFromLayouts();
  // seo.tsx head + metadata head
  const headExtra = [metadataToHead(renderResult.metadata), renderResult.seoHead || ""].filter(Boolean).join("\n");
  let doc;
  if (renderResult.fullDocument) {
    // shell.tsx already rendered <html>/<head>/<body>. Inject framework head
    // assets (metadata, fonts, globals CSS, navigator/HMR scripts) into its
    // <head>; body scripts below still append before </body>.
    const inject = `${await buildHead(headExtra)}\n<script src="/_swift-rust/navigator.js" defer></script>\n<script src="/_swift-rust/hmr-client.js" defer></script>`;
    doc = renderResult.html || "";
    if (!/^\s*<!doctype/i.test(doc)) doc = `<!DOCTYPE html>${doc}`;
    if (doc.includes("</head>")) doc = doc.replace("</head>", `${inject}\n</head>`);
    else doc = doc.replace(/<body([\s>])/i, `<head>${inject}</head><body$1`);
  } else {
    doc = await wrapInDocumentAsync({ head: headExtra, body: renderResult.html || "" });
  }
  // state.ts → window.__SR_STATE__ for client stores
  if (renderResult.serverState !== undefined) {
    const json = JSON.stringify(renderResult.serverState).replace(/</g, "\\u003c");
    doc = doc.replace("</body>", `<script>window.__SR_STATE__=${json}</script>\n</body>`);
  }
  if (renderResult.clientPage && renderResult.pageFile) {
    const src = `/_swift-rust/island.js?p=${encodeURIComponent(renderResult.pageFile)}`;
    doc = doc.replace("</body>", `<script type="module" src="${src}"></script>\n</body>`);
  }
  // Component-level "use client" islands: one self-mounting module per unique
  // source referenced by a marker in the rendered HTML.
  for (const islandSrc of collectIslandSources(doc)) {
    const s = `/_swift-rust/island-comp.js?p=${encodeURIComponent(islandSrc)}`;
    doc = doc.replace("</body>", `<script type="module" src="${s}"></script>\n</body>`);
  }
  // pending.tsx → hidden overlay the client navigator reveals while a
  // navigation is in flight (see runtime/navigator.js).
  const pendingOverlay = await renderPendingOverlay(renderResult.segments);
  if (pendingOverlay) doc = doc.replace("</body>", `${pendingOverlay}\n</body>`);
  // prefetch.ts → client prefetch strategy for the navigator.
  const prefetchCfg = await resolvePrefetchConfig(renderResult.segments);
  if (prefetchCfg) {
    const json = JSON.stringify(prefetchCfg).replace(/</g, "\\u003c");
    doc = doc.replace("</body>", `<script>window.__SR_PREFETCH__=${json}</script>\n</body>`);
  }
  // transition.tsx → View Transitions config for the navigator's swap.
  const transitionCfg = await resolveTransitionConfig(renderResult.segments);
  if (transitionCfg) {
    const json = JSON.stringify(transitionCfg).replace(/</g, "\\u003c");
    doc = doc.replace("</body>", `<script>window.__SR_TRANSITION__=${json}</script>\n</body>`);
  }
  // `use static` guarantee: a static route must not perform request-time work.
  // Setting cookies during render is the one dynamic signal we can catch at
  // runtime — fail loudly rather than silently shipping a wrong cache header.
  if (renderResult.config?.static && (renderResult.setCookies || []).length) {
    const overlay = renderDevError({
      err: toError(staticCookieDiagnostic(renderResult.pageFile, cwd)),
      context: `while rendering ${pathname}`,
      pathname,
      pageFile: renderResult.pageFile,
    });
    return new Response(overlay, {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  const timings = { compile: compileMs, render: renderMs, total: performance.now() - reqStart };
  doc = doc.replace("</body>", `${devInfoTag(pathname, renderResult, timings)}</body>`);
  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8", "Server-Timing": serverTiming(timings) });
  for (const c of renderResult.setCookies || []) headers.append("Set-Cookie", c);
  // config.ts headers
  for (const [k, v] of Object.entries(renderResult.config?.headers || {})) headers.set(k, String(v));
  // revalidate.ts → Cache-Control + cache tags. A 'use static' route with no
  // explicit revalidate plan gets a long-lived, revalidatable CDN cache.
  let cc = cacheControlFromPlan(renderResult.revalidatePlan);
  if (!cc && renderResult.config?.static) cc = "public, max-age=0, s-maxage=31536000, stale-while-revalidate";
  if (cc) headers.set("Cache-Control", cc);
  const tags = renderResult.revalidatePlan?.tags || renderResult.revalidatePlan?.invalidate;
  if (renderResult.ppr) {
    headers.set("x-swift-rust-render", "ppr");
    headers.set("x-swift-rust-ppr", "1");
    if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-cache, no-transform");
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(doc));
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers });
  }
  return new Response(doc, { status: 200, headers });
}

async function handleApiRoute(req, segments, method, reqStart) {
  const route = resolveApiRoute(segments);
  if (!route) {
    const total = performance.now() - reqStart;
    logRequest({ method, url: "/" + segments.join("/"), status: 404, duration: total, compileMs: 0 });
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const mod = await loadModuleFresh(route.file);
    const response = await invokeApiRoute(mod, req, route.params);
    const total = performance.now() - reqStart;
    logRequest({ method, url: "/" + segments.join("/"), status: response.status, duration: total, compileMs: 0 });
    return response;
  } catch (err) {
    if (instrumentationMod && typeof instrumentationMod.onRequestError === "function") {
      try {
        await instrumentationMod.onRequestError(err, req, { routerKind: "App Router", routePath: "/" + segments.join("/") });
      } catch {}
    }
    logError(err, `Failed to handle ${method} /${segments.join("/")}`);
    const total = performance.now() - reqStart;
    logRequest({ method, url: "/" + segments.join("/"), status: 500, duration: total, compileMs: 0 });
    return new Response(JSON.stringify({ error: err?.message || "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

const MIME = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif",
  ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".css": "text/css", ".js": "application/javascript", ".mjs": "application/javascript",
  ".json": "application/json", ".txt": "text/plain", ".woff": "font/woff",
  ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg",
};

await checkAppDir();
try { validateRoutingConventions(); } catch {}
const requestedPort = port;
port = await findFreePort(requestedPort);
if (port !== requestedPort) {
  logLine([
    ` ${paint("yellow", "⚠")} Port ${requestedPort} is in use; using ${paint("cyan", String(port))} instead.`,
  ]);
}
await detectNetworkUrls();
logStartupBanner(`http://localhost:${port}`, networkUrls);
logLine([` ${paint("dim", "› setupWatcher…")}`]);
try {
  setupWatcher();
  logLine([` ${paint("dim", "› watcher ready")}`]);
} catch (err) {
  logLine([` ${paint("red", "watcher error:")} ${err.message}`]);
}

const instrumentationCandidates = [
  join(cwd, "src", "instrumentation.ts"),
  join(cwd, "src", "instrumentation.js"),
  join(cwd, "instrumentation.ts"),
  join(cwd, "instrumentation.js"),
];
for (const p of instrumentationCandidates) {
  if (existsSync(p)) {
    try {
      instrumentationMod = await loadModuleFresh(p);
      if (typeof instrumentationMod.register === "function") {
        await instrumentationMod.register();
        logLine([` ${paint("dim", "› instrumentation registered")}`]);
      }
    } catch (e) {
      logError(e, "instrumentation error");
    }
    break;
  }
}

logLine([` ${paint("dim", `› listen on ${hostname}:${port}…`)}`]);
try {
  if (typeof Bun !== "undefined" && typeof Bun.serve === "function") {
    serverHandle = Bun.serve({
      port,
      hostname,
      // Bun defaults to a 10s idle timeout, which aborts slow renders / large
      // payloads (e.g. the first compile of a heavy page). 255s is Bun's max.
      idleTimeout: 255,
      async fetch(req) {
        return await runWithRouteContext(() => handleFetch(req));
      },
    });
    logReady();
    await new Promise(() => {});
  } else {
    const http = await import("node:http");
    const srv = http.createServer(async (req, res) => {
      await handleRequest(req, res);
    });
    srv.on("error", (err) => logError(err, "server error"));
    srv.listen(port, hostname, () => {
      logReady();
    });
    serverHandle = srv;
  }
} catch (err) {
  logError(err, "listen error");
}

process.on("SIGINT", () => {
  logLine([`\n ${paint("yellow", "■")} ${paint("dim", "Stopping dev server…")}\n`]);
  if (serverHandle && typeof serverHandle.close === "function") {
    serverHandle.close(() => process.exit(0));
  } else if (serverHandle && typeof serverHandle.stop === "function") {
    serverHandle.stop();
    process.exit(0);
  } else {
    process.exit(0);
  }
  setTimeout(() => process.exit(0), 2000).unref();
});
