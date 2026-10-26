const OPT_CATCH_PARAM = /^\[\[\.{3}([^\]]+)\]\]$/;
const CATCH_PARAM = /^\[\.{3}([^\]]+)\]$/;
const NAMED_PARAM = /^\[([^\]]+)\]$/;
const ACTION_PATH = "/_swift-rust/action";
const REWRITE_PARAM = "__sr_path";

export function routeSegments(pathname) {
  const clean = pathname.split("?")[0].split("#")[0];
  if (clean === "/" || clean === "") return [];
  return clean.replace(/^\//, "").split("/").filter(Boolean);
}

const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...headers } });

const childDirs = (node) => node?.children || [];
const childNamed = (node, name) => childDirs(node).find((c) => c.name === name)?.node || null;

function directChild(node, seg) {
  if (seg.startsWith("_")) return childNamed(node, `%5F${seg.slice(1)}`) || childNamed(node, `%5f${seg.slice(1)}`);
  return childNamed(node, seg);
}

function walkApi(node, segs, idx, params) {
  if (idx === segs.length) {
    if (node.route) return { route: node.route, params };
    for (const c of childDirs(node)) {
      const m = c.name.match(OPT_CATCH_PARAM);
      if (m && c.node.route) return { route: c.node.route, params: { ...params, [m[1]]: undefined } };
    }
    return null;
  }
  const seg = segs[idx];
  const direct = directChild(node, seg);
  if (direct) {
    const r = walkApi(direct, segs, idx + 1, params);
    if (r) return r;
  }
  for (const c of childDirs(node)) {
    const named = c.name.match(NAMED_PARAM);
    if (named && !named[1].startsWith("...") && !named[1].startsWith("[")) {
      const r = walkApi(c.node, segs, idx + 1, { ...params, [named[1]]: seg });
      if (r) return r;
    }
  }
  for (const c of childDirs(node)) {
    const m = c.name.match(CATCH_PARAM);
    if (m && c.node.route) return { route: c.node.route, params: { ...params, [m[1]]: segs.slice(idx) } };
  }
  for (const c of childDirs(node)) {
    const m = c.name.match(OPT_CATCH_PARAM);
    if (m && c.node.route) return { route: c.node.route, params: { ...params, [m[1]]: segs.slice(idx) } };
  }
  return null;
}

/**
 * Resolves `/api/...` segments against an `app/api` directory tree
 * (`{ route?, children: [{ name, node }] }`), with the dev server's precedence:
 * literal folder, then `[param]`, then `[...catchAll]`, then `[[...optional]]`.
 */
export function resolveApiTree(apiTree, segments) {
  if (!apiTree || segments[0] !== "api") return null;
  return walkApi(apiTree, segments.slice(1), 0, {});
}

function walkLeaf(node, segs, idx, params) {
  if (idx === segs.length) return { node, params };
  const seg = segs[idx];
  const direct = directChild(node, seg);
  if (direct) {
    const r = walkLeaf(direct, segs, idx + 1, params);
    if (r) return r;
  }
  for (const c of childDirs(node)) {
    const named = c.name.match(NAMED_PARAM);
    if (named && !named[1].startsWith("...") && !named[1].startsWith("[")) {
      const r = walkLeaf(c.node, segs, idx + 1, { ...params, [named[1]]: seg });
      if (r) return r;
    }
  }
  for (const c of childDirs(node)) {
    const m = c.name.match(CATCH_PARAM);
    if (m) return { node: c.node, params: { ...params, [m[1]]: segs.slice(idx) } };
  }
  for (const c of childDirs(node)) {
    const m = c.name.match(OPT_CATCH_PARAM);
    if (m) return { node: c.node, params: { ...params, [m[1]]: segs.slice(idx) } };
  }
  return null;
}

/** Resolves a pathname to its app-dir leaf folder, as the dev server does for rpc.ts / stream.ts. */
export function resolveLeafTree(appTree, segments) {
  return appTree ? walkLeaf(appTree, segments, 0, {}) : null;
}

/**
 * Calls an `app/api/**\/route.ts` module the way the dev server does: the
 * handler gets `{ request, params, query, body, searchParams }`, a returned
 * `Response` passes through, plain objects become JSON, anything else text.
 */
export async function invokeApiRoute(mod, request, params) {
  const method = request.method;
  const handler = mod[method.toUpperCase()] || mod[method.toLowerCase()];
  if (typeof handler !== "function") {
    return json({ error: `Method ${method} not allowed` }, 405, {
      Allow: Object.keys(mod)
        .filter((k) => typeof mod[k] === "function" && k === k.toUpperCase())
        .join(", "),
    });
  }
  const url = new URL(request.url);
  const body = method === "GET" || method === "HEAD" ? null : await request.text().catch(() => null);
  let parsedBody = null;
  if (body) {
    try {
      parsedBody = JSON.parse(body);
    } catch {
      parsedBody = body;
    }
  }
  const result = await handler({
    request,
    params,
    query: Object.fromEntries(url.searchParams),
    body: parsedBody,
    searchParams: Object.fromEntries(url.searchParams),
  });
  if (result instanceof Response) return result;
  if (result && typeof result === "object") {
    return json(result, result.status || 200, result.headers || {});
  }
  return new Response(String(result ?? ""), { status: 200, headers: { "Content-Type": "text/plain" } });
}

export const isActionRequest = (request, pathname) =>
  pathname === ACTION_PATH ||
  (request.method === "POST" && Boolean(request.headers.get("x-action-id") || request.headers.get("next-action")));

/** Parses a server-action request into `{ actionId, args, formData, isJson }` or an error Response. */
export async function parseActionRequest(request) {
  let actionId = request.headers.get("x-action-id") || request.headers.get("next-action");
  const ctype = request.headers.get("content-type") || "";
  const isForm = ctype.includes("multipart/form-data") || ctype.includes("application/x-www-form-urlencoded");
  const isJson = ctype.includes("application/json");
  let args = [];
  let formData = null;
  if (isForm) {
    try {
      formData = await request.formData();
      if (!actionId && formData.has("__sr_action_id")) actionId = String(formData.get("__sr_action_id"));
    } catch {
      return { error: Response.json({ ok: false, error: "Failed to parse form data" }, { status: 400 }) };
    }
  } else if (isJson) {
    try {
      const body = await request.json();
      if (Array.isArray(body)) args = body;
      else if (body && typeof body === "object") {
        if (!actionId && body.actionId) actionId = String(body.actionId);
        if (Array.isArray(body.args)) args = body.args;
        else if (body.data !== undefined) args = [body.data];
        else args = [body];
      }
    } catch {
      return { error: Response.json({ ok: false, error: "Failed to parse JSON body" }, { status: 400 }) };
    }
  } else {
    const text = await request.text().catch(() => "");
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) args = parsed;
        else if (parsed?.actionId) {
          if (!actionId) actionId = String(parsed.actionId);
          args = Array.isArray(parsed.args) ? parsed.args : [parsed];
        } else args = [parsed];
      } catch {
        args = [text];
      }
    }
  }
  if (!actionId) return { error: Response.json({ ok: false, error: "Missing action identifier" }, { status: 400 }) };
  let filePart = "";
  let exportName = "default";
  if (actionId.includes("#")) [filePart, exportName] = actionId.split("#");
  else if (actionId.includes(":")) [filePart, exportName] = actionId.split(":");
  else exportName = actionId;
  return { actionId, filePart, exportName, args, formData, isJson };
}

export const actionExport = (mod, exportName) =>
  mod[exportName] || (exportName === "default" ? (mod.default ?? mod.action) : null);

/** Runs a resolved server action and shapes its response like the dev server. */
export async function runServerAction(fn, parsed, request, { exposeErrors = true } = {}) {
  try {
    const result = parsed.formData ? await fn(parsed.formData) : await fn(...parsed.args);
    if (result instanceof Response) return result;
    const acceptsHtml = (request.headers.get("accept") || "").includes("text/html");
    if (acceptsHtml && !parsed.isJson) {
      return new Response(null, { status: 303, headers: { Location: request.headers.get("referer") || "/" } });
    }
    return Response.json({ ok: true, data: result });
  } catch (err) {
    if (err?.digest && String(err.digest).startsWith("REDIRECT;")) {
      const [, statusStr, ...rest] = String(err.digest).split(";");
      const loc = rest.join(";");
      if (parsed.isJson) return Response.json({ ok: true, redirect: loc });
      return new Response(null, { status: Number.parseInt(statusStr, 10) || 303, headers: { Location: loc } });
    }
    if (!exposeErrors) {
      console.error(`[swift-rust] server action ${parsed.actionId} failed:`, err);
      return Response.json({ ok: false, error: "Server action failed" }, { status: 500 });
    }
    return Response.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
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
  s += `; Path=${opts.path || "/"}`;
  if (opts.domain) s += `; Domain=${opts.domain}`;
  if (opts.httpOnly) s += "; HttpOnly";
  if (opts.secure) s += "; Secure";
  if (opts.sameSite) s += `; SameSite=${opts.sameSite[0].toUpperCase()}${opts.sameSite.slice(1)}`;
  return s;
}

/** The request context passed to rpc.ts / stream.ts handlers. */
export function buildRouteCtx(request, url, params, searchParams) {
  const cookieMap = parseCookieHeader(request?.headers?.get?.("cookie") || "");
  const setCookies = [];
  const cookies = {
    get: (n) => cookieMap.get(n),
    set: (n, v, o) => {
      cookieMap.set(n, v);
      setCookies.push(serializeCookie(n, v, o));
    },
    delete: (n, o) => {
      cookieMap.delete(n);
      setCookies.push(serializeCookie(n, "", { ...o, maxAge: 0 }));
    },
    all: () => cookieMap,
  };
  const localsMap = new Map();
  return {
    url,
    method: request?.method || "GET",
    headers: request?.headers || new Headers(),
    cookies,
    params,
    searchParams,
    runtime: "bun",
    locals: { get: (k) => localsMap.get(k), set: (k, v) => localsMap.set(k, v) },
    request,
    __setCookies: setCookies,
  };
}

/** rpc.ts: POST `{ procedure, input }` runs a procedure; GET lists them. Returns null when not handled. */
export async function invokeRpc(mod, request, ctx) {
  const procs = mod.procedures ?? mod.default;
  if (!procs || typeof procs !== "object") return null;
  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const proc = procs[body.procedure];
    if (!proc) return json({ error: `Unknown procedure: ${body.procedure}` }, 404);
    let input = body.input;
    if (proc.input?.safeParse) {
      const r = proc.input.safeParse(input);
      if (!r.success) return json({ error: "Invalid input", issues: r.error?.issues ?? r.error }, 400);
      input = r.data;
    }
    return json({ data: await proc.handler(input, ctx) });
  }
  if (request.method === "GET") return json({ procedures: Object.keys(procs) });
  return null;
}

/** stream.ts: default export returns a Response or a body streamed as text/event-stream. Returns null when not handled. */
export async function invokeStream(mod, ctx) {
  const fn = mod.default ?? mod.stream;
  if (typeof fn !== "function") return null;
  const result = await fn(ctx);
  if (result instanceof Response) return result;
  return new Response(result, {
    headers: { "Content-Type": mod.contentType || "text/event-stream", "Cache-Control": "no-cache" },
  });
}

function stripExtension(p) {
  return p.replace(/\.(ts|tsx|js|jsx|mjs)$/, "");
}

/**
 * Production lookup for server actions. Only modules registered at build time
 * (`"use server"` files and actions.ts / action.ts) can be called; ids are
 * `path#export` with the path relative to the project root, `src/`, or the app dir.
 */
export function createActionRegistry(entries, defaultKeys = []) {
  const byKey = new Map();
  for (const { keys, mod } of entries) for (const k of keys) if (!byKey.has(k)) byKey.set(k, mod);
  return (filePart, exportName) => {
    let mod = null;
    if (filePart) {
      const clean = filePart.replace(/\\/g, "/").replace(/^\.?\//, "");
      mod = byKey.get(clean) || byKey.get(stripExtension(clean)) || null;
    } else {
      for (const k of defaultKeys) {
        if (byKey.has(k)) {
          mod = byKey.get(k);
          break;
        }
      }
    }
    if (!mod) return null;
    const fn = actionExport(mod, exportName);
    return typeof fn === "function" ? fn : null;
  };
}

/**
 * Handles the request-time endpoints that are not pages: server actions,
 * app/api route handlers, and rpc.ts / stream.ts leaves. Resolves to null when
 * the request is for something else (a page or a static file).
 */
export function createEndpointDispatcher({ apiTree = null, leafTree = null, findAction = null, onRequestError } = {}) {
  const reportError = async (err, request, routePath) => {
    console.error(`[swift-rust] ${request.method} ${routePath} failed:`, err);
    if (typeof onRequestError === "function") {
      try {
        await onRequestError(err, request, { routerKind: "App Router", routePath });
      } catch {}
    }
  };
  return async function dispatch(request) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (findAction && isActionRequest(request, pathname)) {
      const parsed = await parseActionRequest(request);
      if (parsed.error) return parsed.error;
      const fn = findAction(parsed.filePart, parsed.exportName);
      if (!fn) return Response.json({ ok: false, error: `Unknown server action: ${parsed.actionId}` }, { status: 404 });
      return runServerAction(fn, parsed, request, { exposeErrors: false });
    }
    const segments = routeSegments(pathname);
    if (apiTree && segments[0] === "api") {
      const match = resolveApiTree(apiTree, segments);
      if (!match) return json({ error: "Not found" }, 404);
      try {
        return await invokeApiRoute(match.route, request, match.params);
      } catch (err) {
        await reportError(err, request, pathname);
        return json({ error: "Internal error" }, 500);
      }
    }
    if (leafTree) {
      const leaf = resolveLeafTree(leafTree, segments);
      if (leaf && (leaf.node.rpc || leaf.node.stream)) {
        const ctx = buildRouteCtx(request, url, leaf.params, Object.fromEntries(url.searchParams.entries()));
        try {
          if (leaf.node.rpc) {
            const res = await invokeRpc(leaf.node.rpc, request, ctx);
            if (res) return res;
          }
          if (leaf.node.stream) {
            const res = await invokeStream(leaf.node.stream, ctx);
            if (res) return res;
          }
        } catch (err) {
          await reportError(err, request, pathname);
          return leaf.node.rpc ? json({ error: "Internal error" }, 500) : new Response("Internal error", { status: 500 });
        }
      }
    }
    return null;
  };
}

/** Undoes a Vercel rewrite to the endpoints function (`?__sr_path=/api/...`). */
export async function restoreRewrittenRequest(request) {
  const url = new URL(request.url);
  const original = url.searchParams.get(REWRITE_PARAM);
  if (original == null) return request;
  url.searchParams.delete(REWRITE_PARAM);
  url.pathname = original.startsWith("/") ? original : `/${original}`;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return new Request(url, {
    method: request.method,
    headers: request.headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
  });
}
