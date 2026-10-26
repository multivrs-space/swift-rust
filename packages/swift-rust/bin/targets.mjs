export const BUILD_TARGETS = ["multivrs", "vercel"];
export const DEFAULT_TARGET = "multivrs";
export const RENDER_MODES = ["ssr", "ssr-wasm", "ssr-htmx", "wasm"];
export const SERVER_RUNTIMES = ["bun", "node"];
export const MULTIVRS_MANIFEST = "multivrs-build.json";
export const MULTIVRS_BINARY = "server.mjs";
export const MULTIVRS_STATIC_DIR = "static";
export const IMAGE_ROUTE = "/_swift-rust/image";

export function parseTargetFlag(argv = []) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--target" || arg === "-t") return argv[i + 1] ?? "";
    if (arg.startsWith("--target=")) return arg.slice("--target=".length);
  }
  return null;
}

function normalizeTarget(value, source) {
  const target = String(value ?? "").trim().toLowerCase();
  if (!BUILD_TARGETS.includes(target)) {
    const error = new Error(
      `unknown build target ${JSON.stringify(String(value ?? ""))} (from ${source}); expected one of: ${BUILD_TARGETS.join(", ")}`,
    );
    error.code = "SR_UNKNOWN_TARGET";
    throw error;
  }
  return target;
}

/**
 * Resolves the build target. Precedence: `--target` flag, then `"target"` in
 * swift-rust.config.json, then `VERCEL=1` (set by Vercel builds), then Multivrs.
 * @param {{ argv?: string[], env?: Record<string, string | undefined>, config?: { target?: unknown } }} [options]
 * @returns {{ target: "multivrs" | "vercel", source: string }}
 */
export function resolveBuildTarget({ argv = [], env = {}, config = {} } = {}) {
  const flag = parseTargetFlag(argv);
  if (flag !== null) return { target: normalizeTarget(flag, "--target"), source: "--target" };
  if (config && config.target != null) {
    return { target: normalizeTarget(config.target, "swift-rust.config.json"), source: "swift-rust.config.json" };
  }
  if (env.VERCEL === "1") return { target: "vercel", source: "VERCEL=1" };
  return { target: DEFAULT_TARGET, source: "default" };
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function segmentKind(seg) {
  if (seg.startsWith("[[...") && seg.endsWith("]]")) return "opt-catchall";
  if (seg.startsWith("[...") && seg.endsWith("]")) return "catchall";
  if (seg.startsWith("[") && seg.endsWith("]")) return "param";
  return "literal";
}

/**
 * Converts app-dir route segments (e.g. ["b", "[id]"]) into a Multivrs route
 * `src`: a regex matched as ^(?:src)$ against the pathname, allowing an
 * optional trailing slash.
 */
export function routeSrc(segments) {
  let src = "";
  for (const seg of segments) {
    const kind = segmentKind(seg);
    if (kind === "opt-catchall") return `${src}(?:/.*)?`;
    if (kind === "catchall") src += "/.+";
    else if (kind === "param") src += "/[^/]+";
    else src += `/${escapeRegex(seg)}`;
  }
  return src ? `${src}/?` : "/";
}

/** Sort key: literal routes before [param], before catch-alls; deeper routes first. */
export function routeRank(segments) {
  let rank = 0;
  for (const seg of segments) {
    const kind = segmentKind(seg);
    if (kind === "opt-catchall") rank = Math.max(rank, 3);
    else if (kind === "catchall") rank = Math.max(rank, 2);
    else if (kind === "param") rank = Math.max(rank, 1);
  }
  return rank;
}

export function compareRoutes(a, b) {
  return routeRank(a) - routeRank(b) || b.length - a.length;
}

export function sortBySegments(items, getSegments = (item) => item.segments) {
  return [...items].sort((a, b) => compareRoutes(getSegments(a), getSegments(b)));
}

/**
 * Builds the dist/multivrs-build.json manifest. `routes` items are
 * `{ segments, renderMode, runtime? }`; the image route is always included so
 * the manifest has at least one server route.
 */
export function buildMultivrsManifest(routes) {
  const imageSegments = IMAGE_ROUTE.split("/").filter(Boolean);
  const all = sortBySegments([{ segments: imageSegments, renderMode: "ssr", runtime: "bun" }, ...routes]);
  const seen = new Set();
  const out = [];
  for (const r of all) {
    const src = routeSrc(r.segments);
    if (seen.has(src)) continue;
    seen.add(src);
    out.push(r.renderMode === "wasm" ? { src, renderMode: "wasm" } : { src, renderMode: r.renderMode, runtime: r.runtime || "bun" });
  }
  return {
    framework: "swift-rust",
    binary: MULTIVRS_BINARY,
    staticDir: MULTIVRS_STATIC_DIR,
    routes: out,
  };
}

/** Returns a list of contract violations (empty when the manifest is valid). */
export function validateMultivrsManifest(m) {
  const errors = [];
  if (!m || typeof m !== "object") return ["manifest must be an object"];
  const allowed = new Set(["framework", "binary", "staticDir", "routes"]);
  for (const k of Object.keys(m)) if (!allowed.has(k)) errors.push(`unknown top-level field "${k}"`);
  if (m.framework !== "swift-rust") errors.push(`framework must be "swift-rust"`);
  if (typeof m.binary !== "string" || !m.binary || m.binary.startsWith("/")) errors.push("binary must be a relative path");
  if (typeof m.staticDir !== "string" || !m.staticDir || m.staticDir.startsWith("/")) errors.push("staticDir must be a relative path");
  if (!Array.isArray(m.routes) || m.routes.length === 0) {
    errors.push("routes must be a non-empty array");
    return errors;
  }
  m.routes.forEach((r, i) => {
    const at = `routes[${i}]`;
    if (typeof r.src !== "string" || !r.src) errors.push(`${at}.src must be a non-empty string`);
    else {
      try {
        new RegExp(`^(?:${r.src})$`);
      } catch {
        errors.push(`${at}.src is not a valid regular expression`);
      }
    }
    if (!RENDER_MODES.includes(r.renderMode)) errors.push(`${at}.renderMode must be one of ${RENDER_MODES.join(", ")}`);
    if (r.renderMode === "wasm") {
      if ("runtime" in r) errors.push(`${at}.runtime must be omitted for wasm routes`);
    } else if (!SERVER_RUNTIMES.includes(r.runtime)) {
      errors.push(`${at}.runtime must be one of ${SERVER_RUNTIMES.join(", ")}`);
    }
    for (const k of Object.keys(r)) {
      if (!["src", "renderMode", "runtime"].includes(k)) errors.push(`${at} has unknown field "${k}"`);
    }
  });
  return errors;
}
