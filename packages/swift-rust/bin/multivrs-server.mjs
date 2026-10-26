import { existsSync, statSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
};

const mimeFor = (file) => MIME[extname(file).toLowerCase()] || "application/octet-stream";

function serverDir() {
  const script = process.argv[1];
  return script && existsSync(script) ? dirname(resolve(script)) : process.cwd();
}

function resolveInside(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const full = resolve(root, `.${decoded.startsWith("/") ? "" : "/"}${decoded}`);
  return full === root || full.startsWith(root + sep) ? full : null;
}

function findStaticFile(root, pathname) {
  const base = resolveInside(root, pathname);
  if (!base) return null;
  for (const candidate of [base, `${base}.html`, resolve(base, "index.html")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

function fileResponse(file, extraHeaders = {}) {
  return new Response(Bun.file(file), { headers: { "content-type": mimeFor(file), ...extraHeaders } });
}

function serveImage(url, staticRoot) {
  const target = url.searchParams.get("url");
  if (!target) return new Response("Missing url", { status: 400 });
  if (/^https?:\/\//i.test(target)) {
    return new Response(null, { status: 307, headers: { location: target, "cache-control": "public, max-age=3600" } });
  }
  if (!target.startsWith("/") || target.startsWith("//")) return new Response("Invalid url", { status: 400 });
  const pathname = target.split(/[?#]/)[0];
  const file = staticRoot ? findStaticFile(staticRoot, pathname) : null;
  if (!file) {
    return new Response(null, { status: 307, headers: { location: target, "cache-control": "public, max-age=3600" } });
  }
  const w = Number.parseInt(url.searchParams.get("w") || "0", 10);
  return fileResponse(file, {
    "cache-control": "public, max-age=86400",
    "x-swift-rust-image-optimization": "passthrough",
    ...(w > 0 ? { "x-swift-rust-image-width": String(w) } : {}),
  });
}

/**
 * Starts the Multivrs production server: serves /_swift-rust/image, server
 * actions, API routes and rpc/stream endpoints, routes server-rendered pages to
 * their handlers, falls back to files in the static dir when present, and
 * returns 404 for everything else.
 */
export async function startServer({ routes, dispatch = null, notFoundHtml, staticDir = "static", register }) {
  if (typeof Bun === "undefined" || typeof Bun.serve !== "function") {
    throw new Error("server.mjs must be started with Bun: `bun server.mjs`");
  }
  if (typeof register === "function") await register();

  const candidateStatic = resolve(serverDir(), staticDir);
  const staticRoot = existsSync(candidateStatic) ? candidateStatic : null;
  const compiled = routes.map((r) => ({ re: new RegExp(`^(?:${r.src})$`), handler: r.handler }));
  const notFound = () =>
    new Response(notFoundHtml, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });

  async function handle(request) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (pathname === "/_swift-rust/image") return serveImage(url, staticRoot);
    if (dispatch) {
      const endpoint = await dispatch(request);
      if (endpoint) return endpoint;
    }
    for (const route of compiled) {
      if (route.re.test(pathname)) return await route.handler(request);
    }
    if (staticRoot && (request.method === "GET" || request.method === "HEAD")) {
      const file = findStaticFile(staticRoot, pathname);
      if (file) return fileResponse(file);
    }
    return notFound();
  }

  const port = Number.parseInt(process.env.PORT || "", 10) || 8080;
  const server = Bun.serve({
    hostname: "0.0.0.0",
    port,
    async fetch(request) {
      const start = performance.now();
      let response;
      try {
        response = await handle(request);
      } catch (err) {
        console.error(`[swift-rust] ${request.method} ${request.url} failed:`, err);
        response = new Response("Internal Server Error", { status: 500 });
      }
      const ms = (performance.now() - start).toFixed(1);
      console.log(`${request.method} ${new URL(request.url).pathname} ${response.status} ${ms}ms`);
      return response;
    },
  });

  const shutdown = () => {
    server.stop();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  console.log(`[swift-rust] listening on http://0.0.0.0:${server.port}${staticRoot ? "" : " (no static dir; assets come from the CDN)"}`);
  return server;
}
