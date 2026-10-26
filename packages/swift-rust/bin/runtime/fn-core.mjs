// Portable request-time SSR handler used by emitted Vercel functions
// (edge / node / bun). No Bun-only APIs — renders with react-dom/server.
// Mirrors the dev-server route pipeline so emitted functions behave the same.
import { createElement } from "react";

async function renderTree(tree) {
  try {
    const { renderToReadableStream } = await import("react-dom/server.edge");
    const stream = await renderToReadableStream(tree);
    if (stream.allReady) await stream.allReady;
    return await new Response(stream).text();
  } catch {
    const { renderToString } = await import("react-dom/server");
    return renderToString(tree);
  }
}

function parseCookies(request) {
  const header = request.headers.get("cookie") || "";
  const map = new Map();
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) map.set(part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim()));
  }
  return { get: (k) => map.get(k), has: (k) => map.has(k) };
}

function isParamPlaceholder(seg, token) {
  if (!seg) return true;
  let decoded = seg;
  try {
    decoded = decodeURIComponent(seg);
  } catch {}
  return decoded === token || /^\[.+\]$/.test(decoded);
}

function matchParams(pattern, pathname, url, headers) {
  let effectivePath = pathname;
  if (effectivePath.includes("[") || /%5b/i.test(effectivePath)) {
    for (const h of ["x-matched-path", "x-forwarded-uri", "x-original-url"]) {
      const candidate = headers?.get?.(h)?.split("?")[0];
      if (candidate && !candidate.includes("[") && !/%5b/i.test(candidate)) {
        effectivePath = candidate;
        break;
      }
    }
  }
  const segs = effectivePath.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  const routeMatches = new URLSearchParams(headers?.get?.("x-now-route-matches") || "");
  const params = {};
  let paramIdx = 0;
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i];
    if (p.startsWith("[[...") && p.endsWith("]]")) {
      const name = p.slice(5, -2);
      const idx = paramIdx++;
      const tail = segs.slice(i);
      if (tail.length === 0 || isParamPlaceholder(tail[0], p)) {
        const fallback =
          url?.searchParams?.get(`__sr_p${idx}`) ??
          url?.searchParams?.get(name) ??
          routeMatches.get(String(idx + 1)) ??
          routeMatches.get(name);
        if (fallback != null && fallback !== "" && !isParamPlaceholder(fallback, p)) {
          params[name] = fallback
            .split("/")
            .filter(Boolean)
            .map((s) => {
              try {
                return decodeURIComponent(s);
              } catch {
                return s;
              }
            });
        } else {
          params[name] = undefined;
        }
      } else {
        params[name] = tail.map((s) => {
          try {
            return decodeURIComponent(s);
          } catch {
            return s;
          }
        });
      }
      return params;
    }
    if (p.startsWith("[...") && p.endsWith("]")) {
      const name = p.slice(4, -1);
      const idx = paramIdx++;
      const tail = segs.slice(i);
      if (tail.length === 0 || isParamPlaceholder(tail[0], p)) {
        const fallback =
          url?.searchParams?.get(`__sr_p${idx}`) ??
          url?.searchParams?.get(name) ??
          routeMatches.get(String(idx + 1)) ??
          routeMatches.get(name);
        if (fallback != null && !isParamPlaceholder(fallback, p)) {
          params[name] = fallback
            .split("/")
            .filter(Boolean)
            .map((s) => {
              try {
                return decodeURIComponent(s);
              } catch {
                return s;
              }
            });
        } else {
          params[name] = [];
        }
      } else {
        params[name] = tail.map((s) => {
          try {
            return decodeURIComponent(s);
          } catch {
            return s;
          }
        });
      }
      return params;
    }
    if (p.startsWith("[") && p.endsWith("]")) {
      const name = p.slice(1, -1);
      const idx = paramIdx++;
      const rawSeg = segs[i];
      if (!isParamPlaceholder(rawSeg, p)) {
        try {
          params[name] = decodeURIComponent(rawSeg);
        } catch {
          params[name] = rawSeg;
        }
      } else {
        const fallback =
          url?.searchParams?.get(`__sr_p${idx}`) ??
          url?.searchParams?.get(name) ??
          routeMatches.get(String(idx + 1)) ??
          routeMatches.get(name);
        if (fallback != null && !isParamPlaceholder(fallback, p)) {
          params[name] = fallback;
        }
      }
    }
  }
  return params;
}

const pick = (mod, ...keys) => {
  for (const k of keys) if (mod && mod[k] != null) return mod[k];
  return undefined;
};
const matchesMatcher = (pathname, matcher) => {
  const list = Array.isArray(matcher) ? matcher : [matcher];
  return list.some((m) => new RegExp(`^${String(m).replace(/\*\*/g, ".*").replace(/(?<!\.)\*/g, "[^/]*")}$`).test(pathname));
};
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// ── metadata (per-request) ──────────────────────────────────────────────────
function mergeMetadata(...metas) {
  const out = {};
  for (const m of metas) {
    if (!m) continue;
    if (m.title) out.title = typeof m.title === "string" ? m.title : (m.title.default ?? out.title);
    if (m.description) out.description = m.description;
    if (m.keywords) out.keywords = m.keywords;
    if (m.openGraph) out.openGraph = { ...(out.openGraph || {}), ...m.openGraph };
    if (m.twitter) out.twitter = { ...(out.twitter || {}), ...m.twitter };
  }
  return out;
}
function metadataToHead(meta) {
  if (!meta) return "";
  const p = [];
  if (typeof meta.title === "string") p.push(`<title>${esc(meta.title)}</title>`);
  if (meta.description) p.push(`<meta name="description" content="${esc(meta.description)}" />`);
  if (meta.keywords) p.push(`<meta name="keywords" content="${esc(Array.isArray(meta.keywords) ? meta.keywords.join(", ") : meta.keywords)}" />`);
  const og = meta.openGraph;
  if (og) {
    if (og.title) p.push(`<meta property="og:title" content="${esc(og.title)}" />`);
    if (og.description) p.push(`<meta property="og:description" content="${esc(og.description)}" />`);
    if (og.type) p.push(`<meta property="og:type" content="${esc(og.type)}" />`);
    if (og.url) p.push(`<meta property="og:url" content="${esc(og.url)}" />`);
    for (const img of og.images || []) {
      const url = typeof img === "string" ? img : img.url;
      if (url) p.push(`<meta property="og:image" content="${esc(url)}" />`);
      if (typeof img === "object" && img) {
        if (img.width) p.push(`<meta property="og:image:width" content="${esc(img.width)}" />`);
        if (img.height) p.push(`<meta property="og:image:height" content="${esc(img.height)}" />`);
        if (img.alt) p.push(`<meta property="og:image:alt" content="${esc(img.alt)}" />`);
      }
    }
  }
  const tw = meta.twitter;
  if (tw) {
    if (tw.card) p.push(`<meta name="twitter:card" content="${esc(tw.card)}" />`);
    if (tw.title) p.push(`<meta name="twitter:title" content="${esc(tw.title)}" />`);
    if (tw.description) p.push(`<meta name="twitter:description" content="${esc(tw.description)}" />`);
    for (const img of tw.images || []) p.push(`<meta name="twitter:image" content="${esc(typeof img === "string" ? img : img.url)}" />`);
  }
  return p.join("\n");
}
function buildSeoHead(r) {
  if (!r || typeof r !== "object") return "";
  const out = [];
  if (r.title) out.push(`<title>${esc(r.title)}</title>`);
  if (r.description) out.push(`<meta name="description" content="${esc(r.description)}" />`);
  if (r.canonical) out.push(`<link rel="canonical" href="${esc(r.canonical)}" />`);
  if (r.robots) out.push(`<meta name="robots" content="${esc(r.robots)}" />`);
  for (const [k, v] of Object.entries(r.openGraph || {})) out.push(`<meta property="og:${esc(k)}" content="${esc(v)}" />`);
  const jsonLd = r.jsonLd ? (Array.isArray(r.jsonLd) ? r.jsonLd : [r.jsonLd]) : [];
  for (const ld of jsonLd) out.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`);
  return out.join("\n");
}
// Drop captured metadata tags so per-request metadata/seo can replace them.
function stripMeta(head) {
  return head
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\s+name="description"[^>]*>/gi, "")
    .replace(/<meta\s+name="keywords"[^>]*>/gi, "")
    .replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, "")
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, "");
}

function cacheControl(plan) {
  if (!plan) return null;
  if (plan.ttl === 0 || plan.noStore) return "no-store";
  const parts = [];
  if (typeof plan.ttl === "number") parts.push(`s-maxage=${plan.ttl}`, "stale-while-revalidate");
  return parts.length ? `public, ${parts.join(", ")}` : null;
}

function controlToResponse(c, url) {
  if (!c || typeof c !== "object") return null;
  if (c.kind === "redirect") return new Response(null, { status: c.status || 307, headers: { Location: new URL(c.to, url).toString() } });
  if (c.kind === "notFound") return new Response("Not Found", { status: 404 });
  if (c.kind === "response" && c.response) return c.response;
  return null;
}
function thrownToResponse(err, url) {
  if (err?.__response instanceof Response) return err.__response;
  const d = err?.digest;
  if (d && String(d).startsWith("REDIRECT")) {
    const [, status, ...rest] = String(d).split(";");
    return new Response(null, { status: Number(status) || 307, headers: { Location: new URL(rest.join(";"), url).toString() } });
  }
  if (d === "NOT_FOUND" || err?.name === "NotFoundError") return new Response("Not Found", { status: 404 });
  if (d === "FORBIDDEN" || err?.name === "ForbiddenError") return new Response("Forbidden", { status: 403 });
  if (d === "UNAUTHORIZED" || err?.name === "UnauthorizedError") return new Response("Unauthorized", { status: 401 });
  return null;
}

export async function nodeToWebRequest(req) {
  const proto =
    String(req.headers?.["x-forwarded-proto"] || (req.socket?.encrypted ? "https" : "http"))
      .split(",")[0]
      .trim() || "https";
  const host =
    String(req.headers?.["x-forwarded-host"] || req.headers?.host || "localhost")
      .split(",")[0]
      .trim() || "localhost";
  const rawUrl = req.url || "/";
  const fullUrl = /^https?:\/\//i.test(rawUrl)
    ? rawUrl
    : `${proto}://${host}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers || {})) {
    if (Array.isArray(v)) {
      for (const item of v) if (item != null) headers.append(k, String(item));
    } else if (v != null) {
      headers.set(k, String(v));
    }
  }

  const method = req.method || "GET";
  let body;
  if (method !== "GET" && method !== "HEAD") {
    const chunks = [];
    let total = 0;
    if (req[Symbol.asyncIterator]) {
      for await (const chunk of req) {
        const bytes =
          typeof chunk === "string"
            ? new TextEncoder().encode(chunk)
            : chunk instanceof Uint8Array
              ? chunk
              : new Uint8Array(chunk);
        chunks.push(bytes);
        total += bytes.byteLength;
      }
    }
    if (total > 0) {
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.byteLength;
      }
      body = merged;
    } else if (req.body != null) {
      if (typeof req.body === "string" || req.body instanceof Uint8Array) body = req.body;
      else if (typeof req.body === "object") body = JSON.stringify(req.body);
    }
  }

  return new Request(fullUrl, { method, headers, body });
}

export async function sendWebResponseToNode(webRes, res) {
  res.statusCode = webRes.status;
  const setCookies =
    typeof webRes.headers.getSetCookie === "function" ? webRes.headers.getSetCookie() : [];
  if (setCookies.length && typeof res.setHeader === "function") {
    res.setHeader("set-cookie", setCookies);
  }
  if (typeof res.setHeader === "function") {
    webRes.headers.forEach((v, k) => {
      if (k.toLowerCase() === "set-cookie" && setCookies.length) return;
      res.setHeader(k, v);
    });
  }
  const ab = await webRes.arrayBuffer();
  res.end(new Uint8Array(ab));
}

export function makeRouteHandler(opts) {
  async function webFetch(request) {
    const url = new URL(request.url);
    const params = matchParams(opts.pattern || [], url.pathname, url, request.headers);
    for (const k of [...url.searchParams.keys()]) {
      if (k.startsWith("__sr_p")) url.searchParams.delete(k);
    }
    if (url.pathname.includes("[") || /%5b/i.test(url.pathname)) {
      const resolvedSegs = [];
      for (const seg of opts.pattern || []) {
        if (seg.startsWith("[...") && seg.endsWith("]")) {
          const v = params[seg.slice(4, -1)];
          if (Array.isArray(v)) resolvedSegs.push(...v.map((s) => encodeURIComponent(String(s))));
        } else if (seg.startsWith("[") && seg.endsWith("]")) {
          const v = params[seg.slice(1, -1)];
          if (v != null) resolvedSegs.push(encodeURIComponent(String(v)));
        } else {
          resolvedSegs.push(seg);
        }
      }
      if (resolvedSegs.length) url.pathname = `/${resolvedSegs.join("/")}`;
    }
    const setCookies = [];
    const localsMap = new Map();
    const ctx = {
      url,
      request,
      method: request.method,
      headers: request.headers,
      params,
      searchParams: Object.fromEntries(url.searchParams.entries()),
      cookies: parseCookies(request),
      locals: { get: (k) => localsMap.get(k), set: (k, v) => localsMap.set(k, v) },
      runtime: opts.runtime,
      __setCookies: setCookies,
    };

    try {
      // proxy
      for (const mod of opts.proxies || []) {
        const fn = pick(mod, "default", "proxy");
        if (typeof fn !== "function") continue;
        if (mod.matcher && !matchesMatcher(url.pathname, mod.matcher)) continue;
        const r = controlToResponse(await fn(ctx), url);
        if (r) return r;
      }

      // i18n — resolve locale into locals
      const i18nCfg = pick(opts.i18n || {}, "i18n", "default");
      if (i18nCfg && Array.isArray(i18nCfg.locales)) {
        let locale = i18nCfg.defaultLocale ?? i18nCfg.locales[0];
        if (typeof i18nCfg.resolve === "function") locale = (await i18nCfg.resolve(ctx)) || locale;
        else if (i18nCfg.strategy === "cookie") locale = ctx.cookies.get("locale") || locale;
        else if (i18nCfg.strategy === "header") {
          const al = request.headers.get("accept-language")?.split(",")[0]?.split("-")[0];
          if (al && i18nCfg.locales.includes(al)) locale = al;
        }
        ctx.locals.set("locale", locale);
        ctx.__locale = locale;
      }

      // schema / query
      const querySpec = pick(opts.query || {}, "query");
      for (const mod of opts.schemas || []) {
        if (mod.params?.safeParse) {
          const r = mod.params.safeParse(ctx.params);
          if (!r.success) return Response.json({ error: "Invalid params", issues: r.error?.issues ?? r.error }, { status: 400 });
          Object.assign(ctx.params, r.data);
        }
        const searchSchema = querySpec?.parse ?? mod.searchParams;
        if (searchSchema?.safeParse) {
          const r = searchSchema.safeParse(ctx.searchParams);
          if (r.success) Object.assign(ctx.searchParams, r.data);
        }
      }

      // guard (opt-in)
      if (opts.guardEnabled) {
        for (const mod of opts.guards || []) {
          const fn = pick(mod, "default", "guard");
          if (typeof fn !== "function") continue;
          const r = controlToResponse(await fn(ctx), url);
          if (r) return r;
        }
      }

      // action (mutations)
      let actionData;
      if (ctx.method !== "GET" && ctx.method !== "HEAD" && opts.action) {
        const fn = pick(opts.action, "default", "action");
        if (typeof fn === "function") {
          const actx = Object.assign({}, ctx, { formData: () => request.formData(), json: () => request.json() });
          const result = await fn(actx);
          const r = controlToResponse(result, url);
          if (r) return r;
          actionData = result;
        }
      }

      // loaders (parallel)
      const loaded = await Promise.all(
        (opts.loaders || []).map(async (mod) => {
          const fn = pick(mod, "default", "loader");
          return typeof fn === "function" ? fn(ctx) : undefined;
        }),
      );
      const loaderData = loaded.length ? loaded[loaded.length - 1] : undefined;

      // state
      let serverState;
      const stateFn = pick(opts.state || {}, "default", "state");
      if (typeof stateFn === "function") serverState = await stateFn(ctx);

      // seo
      let seoHead = "";
      const seoFn = pick(opts.seo || {}, "default", "seo");
      if (typeof seoFn === "function") seoHead = buildSeoHead(await seoFn(Object.assign({}, ctx, { data: loaderData })));

      // per-request metadata (layout metadata + page metadata/generateMetadata)
      const metas = [];
      for (const m of opts.layoutMetas || []) if (m?.metadata) metas.push(m.metadata);
      const pageMod = opts.page;
      if (typeof pageMod.generateMetadata === "function") {
        metas.push(await pageMod.generateMetadata({ params: ctx.params, searchParams: ctx.searchParams }));
      } else if (pageMod.metadata) {
        metas.push(pageMod.metadata);
      }
      const metaHead = metadataToHead(mergeMetadata(...metas));

      // Expose loader/action data to useLoaderData()/useActionData() via the
      // router's globalThis context box (same channel the dev server uses).
      const g = globalThis;
      g.__SR_ROUTE_CTX__ = g.__SR_ROUTE_CTX__ || { current: null };
      g.__SR_ROUTE_CTX__.current = { request: ctx, loaderData, actionData, loaders: {} };

      // render: page → (slots) → layouts
      const Page = pick(opts.page, "default", "Page", "page");
      let tree = createElement(Page, { params: ctx.params, loaderData });
      if (opts.isClient) {
        tree = createElement("div", { id: "__sr_island_root", "data-sr-params": JSON.stringify(ctx.params) }, tree);
      }
      const layouts = opts.layouts || [];
      const templates = opts.templates || [];
      const slotsByLayout = opts.slots || [];
      for (let i = layouts.length - 1; i >= 0; i--) {
        if (templates[i]) {
          const Template = pick(templates[i], "default", "Template", "template");
          if (Template) tree = createElement(Template, null, tree);
        }
        if (layouts[i]) {
          const Layout = pick(layouts[i], "default", "Layout", "layout");
          if (Layout) {
            const slotProps = {};
            for (const slot of slotsByLayout[i] || []) {
              const SlotComp = pick(slot.mod, "default", "Page", "Fragment", "page", "fragment");
              if (SlotComp) slotProps[slot.name] = createElement(SlotComp, {});
            }
            tree = createElement(Layout, slotProps, tree);
          }
        }
      }
      const body = await renderTree(tree);
      g.__SR_ROUTE_CTX__.current = null;

      // head: captured assets (metadata stripped) + per-request metadata + seo
      let head = stripMeta(opts.head || "");
      head += metaHead;
      if (/<title/i.test(seoHead)) head = head.replace(/<title>[\s\S]*?<\/title>/i, "");
      head += seoHead;

      const stateScript =
        serverState !== undefined ? `<script>window.__SR_STATE__=${JSON.stringify(serverState).replace(/</g, "\\u003c")}</script>` : "";
      const islandScript = opts.isClient && opts.islandSrc ? `<script type="module" src="${opts.islandSrc}"></script>` : "";
      const html = `<!DOCTYPE html><html lang="${ctx.__locale || "en"}"><head>${head}</head><body>${body}${opts.bodyScripts || ""}${stateScript}${islandScript}</body></html>`;

      // revalidate → Cache-Control + tags
      let plan = opts.configRevalidate != null ? { ttl: opts.configRevalidate } : undefined;
      const revFn = pick(opts.revalidate || {}, "default", "revalidate");
      if (typeof revFn === "function") {
        const p = await revFn(Object.assign({}, ctx, { data: loaderData, afterAction: ctx.method !== "GET" }));
        if (p && typeof p === "object") plan = { ...plan, ...p };
      }

      const isPpr = Boolean(
        opts.ppr ||
        opts.page?.experimental_ppr ||
        opts.page?.config?.ppr ||
        opts.config?.ppr
      );
      const headers = new Headers({ "content-type": "text/html; charset=utf-8", "x-swift-rust-runtime": opts.runtime || "bun" });
      if (isPpr) {
        headers.set("x-swift-rust-render", "ppr");
        headers.set("x-swift-rust-ppr", "1");
      }
      for (const [k, v] of Object.entries(opts.config?.headers || {})) headers.set(k, String(v));
      const cc = cacheControl(plan);
      if (cc) headers.set("cache-control", cc);
      const tags = plan?.tags || plan?.invalidate;
      if (Array.isArray(tags) && tags.length) headers.set("x-vercel-cache-tags", tags.join(","));
      for (const c of setCookies) headers.append("set-cookie", c);
      return new Response(html, { headers });
    } catch (err) {
      const resp = thrownToResponse(err, url);
      if (resp) return resp;
      return new Response(`Internal Error: ${err?.message || err}`, { status: 500 });
    }
  }

  async function universalHandler(req, res) {
    if (res && typeof res.end === "function") {
      const webReq = await nodeToWebRequest(req);
      const webRes = await webFetch(webReq);
      await sendWebResponseToNode(webRes, res);
      return;
    }
    return webFetch(req);
  }
  universalHandler.fetch = universalHandler;
  return universalHandler;
}
