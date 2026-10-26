import { expect } from "bun:test";

type Case = {
  name: string;
  method: string;
  path: string;
  json?: unknown;
  form?: Record<string, string>;
  headers?: Record<string, string>;
  status: number;
  contentType?: string;
  body?: unknown;
  text?: string;
  allow?: string;
  location?: string;
};

export const ENDPOINT_CASES: Case[] = [
  {
    name: "GET with query",
    method: "GET",
    path: "/api/items?limit=5",
    status: 200,
    contentType: "application/json",
    body: { items: ["a", "b"], limit: "5" },
  },
  {
    name: "POST JSON body, status from object",
    method: "POST",
    path: "/api/items",
    json: { name: "x" },
    status: 201,
    body: { created: "x", status: 201 },
  },
  {
    name: "missing method → 405 + Allow",
    method: "PUT",
    path: "/api/items",
    status: 405,
    allow: "GET, POST",
    body: { error: "Method PUT not allowed" },
  },
  {
    name: "[id] param + query",
    method: "GET",
    path: "/api/items/42?q=z",
    status: 200,
    body: { id: "42", q: "z" },
  },
  { name: "Response passthrough", method: "DELETE", path: "/api/items/42", status: 204 },
  {
    name: "[...catchAll]",
    method: "GET",
    path: "/api/files/a/b/c.txt",
    status: 200,
    body: { path: ["a", "b", "c.txt"] },
  },
  {
    name: "plain return → text/plain",
    method: "GET",
    path: "/api/text",
    status: 200,
    contentType: "text/plain",
    text: "plain text",
  },
  {
    name: "unknown API path → JSON 404",
    method: "GET",
    path: "/api/nope",
    status: 404,
    body: { error: "Not found" },
  },
  {
    name: "bare /api → JSON 404",
    method: "GET",
    path: "/api",
    status: 404,
    body: { error: "Not found" },
  },
  {
    name: "instrumentation register ran",
    method: "GET",
    path: "/api/instrumentation",
    status: 200,
    body: { registered: true, lastError: null },
  },
  {
    name: "rpc.ts POST",
    method: "POST",
    path: "/calc",
    json: { procedure: "add", input: { a: 2, b: 3 } },
    status: 200,
    body: { data: 5 },
  },
  {
    name: "rpc.ts GET lists procedures",
    method: "GET",
    path: "/calc",
    status: 200,
    body: { procedures: ["add"] },
  },
  {
    name: "rpc.ts unknown procedure",
    method: "POST",
    path: "/calc",
    json: { procedure: "nope" },
    status: 404,
    body: { error: "Unknown procedure: nope" },
  },
  {
    name: "stream.ts",
    method: "GET",
    path: "/events",
    status: 200,
    contentType: "text/event-stream",
    text: "data: hello\n\n",
  },
  {
    name: "server action via JSON",
    method: "POST",
    path: "/_swift-rust/action",
    json: { actionId: "src/app/actions.ts#rpcMultiply", args: [6, 7] },
    status: 200,
    body: { ok: true, data: { result: 42 } },
  },
  {
    name: "server action via <Form> redirects back",
    method: "POST",
    path: "/_swift-rust/action",
    form: { __sr_action_id: "src/app/actions.ts#addItem", name: "f" },
    headers: { accept: "text/html", referer: "/serveraction" },
    status: 303,
    location: "/serveraction",
  },
  {
    name: "server action without id",
    method: "POST",
    path: "/_swift-rust/action",
    json: { args: [1] },
    status: 400,
    body: { ok: false, error: "Missing action identifier" },
  },
];

export async function runEndpointCase(base: string, c: Case) {
  const headers: Record<string, string> = { ...(c.headers || {}) };
  let body: string | URLSearchParams | undefined;
  if (c.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(c.json);
  }
  if (c.form) body = new URLSearchParams(c.form);
  const res = await fetch(base + c.path, { method: c.method, headers, body, redirect: "manual" });
  expect(res.status).toBe(c.status);
  if (c.contentType) expect(res.headers.get("content-type") || "").toStartWith(c.contentType);
  if (c.allow) expect(res.headers.get("allow")).toBe(c.allow);
  if (c.location) expect(res.headers.get("location")).toBe(c.location);
  if (c.body !== undefined) expect(await res.json()).toEqual(c.body);
  if (c.text !== undefined) expect(await res.text()).toBe(c.text);
}

const lateId = (html: string) => html.match(/data-late-id="([^"]*)"/)?.[1];

/**
 * Two overlapping requests to /ctx/[id]: the slow one suspends, the fast one
 * renders and finishes in between. Each must still read its own loader data.
 */
export async function expectIsolatedRouteContext(render: (path: string) => Promise<string>) {
  const slow = render("/ctx/slow-1");
  await new Promise((resolve) => setTimeout(resolve, 20));
  const fast = render("/ctx/fast-2");
  expect([lateId(await slow), lateId(await fast)]).toEqual(["slow-1", "fast-2"]);
}
