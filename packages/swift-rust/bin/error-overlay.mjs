import { relative } from "node:path";
import { diagnose, renderTerminal } from "./diagnostics.mjs";
import { FRAMEWORK_VERSION } from "./runtime/framework-version.mjs";

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineCode(s) {
  return escapeHtml(s).replace(/`([^`]+)`/g, "<code>$1</code>");
}

/**
 * Unwraps Bun.build AggregateError (`err.errors`) or failed build `logs` into a
 * single Error that keeps every structured message (`items`) with its
 * position, so diagnostics can point at the exact span instead of "Bundle failed".
 */
export function normalizeBuildError(err, logs = [], cwd = process.cwd()) {
  const rawItems = [
    ...(Array.isArray(err?.errors) ? err.errors : []),
    ...(Array.isArray(logs) ? logs.filter((l) => !l?.level || l.level === "error") : []),
  ];
  if (rawItems.length === 0 && err instanceof Error && err.message !== "Bundle failed") return err;

  const items = rawItems.map((item) => ({
    name: item?.name || item?.constructor?.name,
    message: item?.message || String(item),
    specifier: item?.specifier,
    position: item?.position ? { ...item.position } : null,
  }));
  const detail =
    items
      .map((i) => (i.position?.file ? `${i.message} (at ${relative(cwd, i.position.file)}:${i.position.line || 1}:${i.position.column || 1})` : i.message))
      .join("\n") ||
    (err?.message && err.message !== "Bundle failed" ? err.message : "Module bundling failed — check imports and syntax in this file.");

  const out = new Error(detail);
  out.name = items[0]?.name || err?.name || "BuildError";
  out.items = items;
  if (items[0]?.position) out.position = items[0].position;
  if (items[0]?.specifier) out.specifier = items[0].specifier;
  if (err?.stack) out.stack = err.stack;
  return out;
}

/** rustc-style terminal block for any error (compat wrapper over `diagnose`). */
export function formatTerminalError(err, context = "Error", cwd = process.cwd(), paint = (_c, s) => s, extra = {}) {
  const cleanContext = context ? context.replace(`${cwd}/`, "") : null;
  const diagnostic = err?.code && err?.title && err?.helps ? err : diagnose(err, { cwd, context: cleanContext, ...extra });
  const solution = diagnostic.helps[0]?.message || "";
  return {
    formatted: renderTerminal(diagnostic, paint),
    code: diagnostic.code,
    title: diagnostic.title,
    message: String(diagnostic.message || "").replaceAll(`${cwd}/`, ""),
    solution,
    diagnostic,
  };
}

function frameHtml(d) {
  if (!d.frame) return "";
  const { start, lines } = d.frame;
  const width = String(start + lines.length - 1).length;
  const rows = lines.map((text, i) => {
    const n = start + i;
    const target = n === d.location?.line;
    let row = `<div class="ln${target ? " is-target" : ""}"><span class="gutter">${String(n).padStart(width)}</span><span class="src">${escapeHtml(text) || " "}</span></div>`;
    if (target) {
      const col = Math.max(1, d.location.column);
      const prefix = String(text).slice(0, col - 1).replace(/\S/g, " ");
      const carets = "^".repeat(Math.max(1, d.location.length || 1));
      row += `<div class="ln caret-row"><span class="gutter">${" ".repeat(width)}</span><span class="src">${escapeHtml(prefix)}<span class="caret">${carets}</span>${d.label ? ` <span class="caret-label">${inlineCode(d.label)}</span>` : ""}</span></div>`;
    }
    return row;
  });
  return `<pre class="frame">${rows.join("")}</pre>`;
}

function diffHtml(h) {
  if (!h.diff) return "";
  const width = String(Math.max(...h.diff.map((l) => l.n))).length;
  const rows = h.diff.map((l) => {
    const [a, b] = l.mark || [0, 0];
    const body = `${escapeHtml(l.text.slice(0, a))}<mark>${escapeHtml(l.text.slice(a, b))}</mark>${escapeHtml(l.text.slice(b))}`;
    return `<div class="dl ${l.type === "+" ? "add" : "del"}"><span class="gutter">${String(l.n).padStart(width)}</span><span class="sign">${l.type}</span><span class="src">${body || " "}</span></div>`;
  });
  return `<pre class="diff">${rows.join("")}</pre>`;
}

function helpHtml(h, i, d) {
  const file = h.file && h.file !== d.location?.file ? ` <span class="muted">in ${escapeHtml(h.file)}</span>` : "";
  const copy = h.command || h.snippet || (h.diff ? h.diff.filter((l) => l.type === "+").map((l) => l.text).join("\n") : "");
  return `<div class="help">
    <div class="help-head"><span class="tag help-tag">help</span><span class="help-msg">${inlineCode(h.message)}${file}</span>${copy ? `<button class="mini" data-copy="${escapeHtml(copy)}">Copy</button>` : ""}</div>
    ${diffHtml(h)}
    ${h.command ? `<pre class="cmd"><span class="muted">$</span> ${escapeHtml(h.command)}</pre>` : ""}
    ${h.snippet ? `<pre class="snippet">${escapeHtml(h.snippet)}</pre>` : ""}
  </div>`;
}

function stackHtml(d) {
  if (!d.stack) return "";
  const rows = d.stack
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const m = l.trim().match(/^at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/);
      if (!m) return `<div class="frame-row head">${escapeHtml(l.trim())}</div>`;
      const vendor = /node_modules|swift-rust[\\/](?:packages[\\/]swift-rust[\\/])?bin|^node:|native/.test(m[2]);
      return `<div class="frame-row${vendor ? " vendor" : ""}"><span class="fn">${escapeHtml(m[1] || "<anonymous>")}</span>${
        vendor
          ? `<span class="muted">${escapeHtml(m[2])}:${m[3]}</span>`
          : `<button class="link" data-open="${escapeHtml(m[2])}" data-line="${m[3]}" data-col="${m[4]}">${escapeHtml(m[2])}:${m[3]}:${m[4]}</button>`
      }</div>`;
    });
  return `<details class="stack"><summary>Call stack</summary><div class="frames">${rows.join("")}</div></details>`;
}

const KIND_LABEL = {
  compile: ["Build error", "#f59e0b"],
  runtime: ["Runtime error", "#ef4444"],
  system: ["System error", "#f97316"],
  routing: ["Routing error", "#a78bfa"],
  config: ["Config error", "#38bdf8"],
  notFound: ["Not found", "#a3a3a3"],
};

/**
 * Full-page dev error overlay.
 * @param {{ error?: unknown; diagnostic?: object; message?: string; stack?: string; context?: string; file?: string; line?: number; column?: number; kind?: string; cwd?: string; pageFile?: string; layoutFiles?: string[]; errorFile?: string }} [params]
 */
export function errorOverlayHTML(params = {}) {
  const cwd = params.cwd || process.cwd();
  let d = params.diagnostic;
  if (!d) {
    const source =
      params.error ??
      Object.assign(new Error(params.message || "An unexpected error occurred"), {
        stack: params.stack || undefined,
        file: params.file,
        line: params.line,
        column: params.column,
      });
    d = diagnose(source, { cwd, context: params.context, pageFile: params.pageFile, layoutFiles: params.layoutFiles, errorFile: params.errorFile });
  }
  const kind = params.kind || d.kind;
  const [kindLabel, color] = KIND_LABEL[kind] || KIND_LABEL.runtime;
  const sev = d.severity === "warning" ? "warning" : "error";
  const rawMessage = String(d.message || "").trim();
  const showRaw = rawMessage && rawMessage.toLowerCase() !== String(d.title).replace(/`/g, "").toLowerCase();
  const json = JSON.stringify(d).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en" data-sr-error-page>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(`${sev}${d.code ? `[${d.code}]` : ""}: ${String(d.title).replace(/`/g, "")}`)} · Swift Rust</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  *, *::before, *::after { box-sizing: border-box; }
  :root { color-scheme: dark; --accent: ${color}; }
  html, body { margin: 0; padding: 0; }
  body { font: 14px/1.55 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; background: radial-gradient(1200px 500px at 10% -10%, ${color}14, transparent 60%), #09090b; color: #e4e4e7; min-height: 100vh; -webkit-font-smoothing: antialiased; }
  code, pre, .mono { font-family: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace; }
  code { background: #ffffff10; border: 1px solid #ffffff14; padding: 0 5px; border-radius: 4px; font-size: .92em; color: #fafafa; }
  .page { max-width: 960px; margin: 0 auto; padding: 40px 24px 80px; }
  .top { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 28px; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; letter-spacing: -.01em; }
  .brand svg { width: 26px; height: 26px; }
  .muted { color: #71717a; }
  kbd { background: #18181b; border: 1px solid #27272a; border-bottom-width: 2px; border-radius: 4px; padding: 0 5px; font: 11px ui-monospace, monospace; color: #a1a1aa; }
  .card { background: #0c0c0eee; border: 1px solid #27272a; border-radius: 14px; overflow: hidden; box-shadow: 0 30px 80px -40px #000; }
  .head { padding: 22px 24px 18px; border-bottom: 1px solid #1f1f23; position: relative; }
  .head::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--accent); }
  .meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  .tag { font: 600 11px/1 ui-monospace, monospace; padding: 4px 7px; border-radius: 5px; letter-spacing: .02em; }
  .sev { color: ${sev === "warning" ? "#facc15" : "#f87171"}; background: ${sev === "warning" ? "#facc1514" : "#f8717114"}; border: 1px solid ${sev === "warning" ? "#facc1533" : "#f8717133"}; }
  .kind { color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent); font-family: inherit; text-transform: uppercase; }
  .ctx { font-size: 12px; color: #71717a; }
  .spacer { flex: 1; }
  h1 { margin: 0; font-size: 19px; line-height: 1.4; font-weight: 600; color: #fafafa; letter-spacing: -.01em; }
  h1 code { font-size: .9em; }
  .body { padding: 20px 24px 24px; }
  .loc { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 8px; font: 12px ui-monospace, monospace; color: #a1a1aa; }
  .loc .arrow { color: #60a5fa; }
  pre.frame, pre.diff, pre.cmd, pre.snippet, .frames { margin: 0; background: #050506; border: 1px solid #1f1f23; border-radius: 10px; padding: 12px 0; overflow-x: auto; font-size: 12.5px; line-height: 1.65; }
  pre.cmd, pre.snippet { padding: 10px 14px; color: #d4d4d8; }
  .ln, .dl { display: flex; white-space: pre; padding: 0 14px; }
  .ln .src { color: #a1a1aa; }
  .ln.is-target { background: #ef44440f; }
  .ln.is-target .src { color: #fafafa; }
  .gutter { color: #3f3f46; user-select: none; padding-right: 14px; text-align: right; min-width: 2ch; }
  .ln.is-target .gutter { color: #f87171; }
  .caret { color: ${sev === "warning" ? "#facc15" : "#f87171"}; font-weight: 700; }
  .caret-label { color: ${sev === "warning" ? "#fde047" : "#fca5a5"}; font-weight: 600; white-space: pre-wrap; }
  .caret-label code { background: none; border: 0; padding: 0; color: inherit; }
  .notes { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 6px; }
  .notes li { display: flex; gap: 10px; color: #a1a1aa; font-size: 13px; }
  .notes .tag { flex-shrink: 0; color: #93c5fd; background: #60a5fa12; border: 1px solid #60a5fa2a; }
  .help { margin-top: 16px; }
  .help-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px; }
  .help-tag { flex-shrink: 0; color: #5eead4; background: #2dd4bf12; border: 1px solid #2dd4bf33; }
  .help-msg { flex: 1; color: #e4e4e7; font-size: 13.5px; }
  .dl.del { background: #ef44440d; } .dl.del .sign, .dl.del mark { color: #fca5a5; }
  .dl.add { background: #22c55e0f; } .dl.add .sign, .dl.add mark { color: #86efac; }
  .dl .sign { width: 1.5ch; user-select: none; }
  .dl .src { color: #a1a1aa; }
  mark { background: transparent; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }
  .dl.del mark { background: #ef444426; } .dl.add mark { background: #22c55e26; }
  details { margin-top: 18px; }
  summary { cursor: pointer; color: #a1a1aa; font-size: 12.5px; user-select: none; }
  summary:hover { color: #fafafa; }
  details > pre, details > .frames { margin-top: 10px; }
  .frames { padding: 8px 0; max-height: 340px; overflow: auto; }
  .frame-row { display: flex; gap: 12px; padding: 3px 14px; font-size: 12px; }
  .frame-row.head { color: #fafafa; }
  .frame-row .fn { color: #e4e4e7; min-width: 140px; }
  .frame-row.vendor { opacity: .45; }
  .raw { white-space: pre-wrap; word-break: break-word; color: #d4d4d8; padding: 12px 14px; }
  .actions { display: flex; gap: 8px; margin-top: 24px; flex-wrap: wrap; }
  .btn, .mini, .link { font: inherit; cursor: pointer; }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 13px; border-radius: 8px; font-size: 13px; font-weight: 500; border: 1px solid #27272a; background: #18181b; color: #e4e4e7; text-decoration: none; transition: background .15s, border-color .15s; }
  .btn:hover { background: #27272a; border-color: #3f3f46; }
  .btn.primary { background: #fafafa; color: #09090b; border-color: #fafafa; }
  .btn.primary:hover { background: #e4e4e7; }
  .mini { font-size: 11px; padding: 3px 8px; border-radius: 6px; border: 1px solid #27272a; background: #131316; color: #a1a1aa; }
  .mini:hover { color: #fafafa; border-color: #3f3f46; }
  .link { background: none; border: 0; padding: 0; color: #93c5fd; text-align: left; font-family: ui-monospace, monospace; font-size: 12px; }
  .link:hover { text-decoration: underline; }
  .footer { margin-top: 28px; display: flex; justify-content: space-between; font-size: 11.5px; color: #52525b; }
  .footer a { color: #71717a; text-decoration: none; } .footer a:hover { color: #a1a1aa; }
  .toast { position: fixed; top: 18px; left: 50%; transform: translate(-50%, -8px); opacity: 0; transition: .18s; background: #18181b; border: 1px solid #27272a; color: #fafafa; padding: 7px 12px; border-radius: 8px; font-size: 12.5px; pointer-events: none; }
  .toast.show { opacity: 1; transform: translate(-50%, 0); }
  @media (max-width: 640px) { .page { padding: 20px 12px 64px; } .head, .body { padding-left: 16px; padding-right: 16px; } }
</style>
</head>
<body>
<div class="page">
  <div class="top">
    <div class="brand">
      <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#0a0a0a" stroke="#27272a"/><g stroke="#fff" stroke-width="1.9" stroke-linecap="round" fill="none"><circle cx="16" cy="16" r="6.4"/><path d="M16 4.4v2.6M16 25v2.6M4.4 16h2.6M25 16h2.6M7.9 7.9l1.8 1.8M22.3 22.3l1.8 1.8M7.9 24.1l1.8-1.8M22.3 9.7l1.8-1.8"/></g><path d="M17.8 9.3 L11.6 17 H15.2 L14.2 22.8 L20.4 15 H16.8 Z" fill="#fb923c"/></svg>
      <span>Swift Rust <span class="muted" style="font-weight:400">dev</span></span>
    </div>
    <div class="muted" style="font-size:12px">Save the file to retry · <kbd>Esc</kbd> reload</div>
  </div>

  <div class="card">
    <div class="head">
      <div class="meta">
        <span class="tag sev">${sev}${d.code ? `[${escapeHtml(d.code)}]` : ""}</span>
        <span class="tag kind">${escapeHtml(kindLabel)}</span>
        ${d.context ? `<span class="ctx">${escapeHtml(d.context)}</span>` : ""}
        <span class="spacer"></span>
        <button class="mini" data-copy-ai>Copy for AI</button>
        ${d.docs ? `<a class="mini" href="${escapeHtml(d.docs)}" target="_blank" rel="noreferrer" style="text-decoration:none">Docs ${escapeHtml(d.code)} ↗</a>` : ""}
      </div>
      <h1>${inlineCode(d.title)}</h1>
    </div>
    <div class="body">
      ${
        d.location
          ? `<div class="loc"><span><span class="arrow">--&gt;</span> ${escapeHtml(d.location.file)}:${d.location.line}:${d.location.column}</span><button class="mini" data-open="${escapeHtml(d.location.abs || d.location.file)}" data-line="${d.location.line}" data-col="${d.location.column}">Open in editor</button></div>${frameHtml(d)}`
          : ""
      }
      ${d.notes?.length ? `<ul class="notes">${d.notes.map((n) => `<li><span class="tag">note</span><span>${inlineCode(n)}</span></li>`).join("")}</ul>` : ""}
      ${(d.helps || []).map((h, i) => helpHtml(h, i, d)).join("")}
      ${showRaw ? `<details><summary>Original error message</summary><pre class="frames raw">${escapeHtml(rawMessage)}</pre></details>` : ""}
      ${stackHtml(d)}
      <div class="actions">
        <button class="btn primary" onclick="location.reload()">Reload page</button>
        <a class="btn" href="/">Go home</a>
      </div>
    </div>
  </div>

  <div class="footer">
    <div>Swift Rust v${escapeHtml(FRAMEWORK_VERSION)} · dev mode</div>
    <div><a href="https://github.com/multivrs-space/swift-rust/issues">Report this error</a></div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script type="application/json" id="__sr_diagnostic">${json}</script>
<script>
(function () {
  var d = JSON.parse(document.getElementById("__sr_diagnostic").textContent);
  var toast = document.getElementById("toast");
  function say(t) { toast.textContent = t; toast.classList.add("show"); clearTimeout(say.t); say.t = setTimeout(function () { toast.classList.remove("show"); }, 1400); }
  function copy(text, label) { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { say(label || "Copied"); }, function () { say("Copy failed"); }); }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-copy],[data-copy-ai],[data-open]");
    if (!t) return;
    if (t.hasAttribute("data-copy-ai")) return copy(d.markdown, "Copied error as Markdown");
    if (t.hasAttribute("data-copy")) return copy(t.getAttribute("data-copy"));
    var q = "file=" + encodeURIComponent(t.getAttribute("data-open")) + "&line=" + (t.getAttribute("data-line") || 1) + "&column=" + (t.getAttribute("data-col") || 1);
    fetch("/_swift-rust/open-editor?" + q, { method: "POST" }).then(function (r) { return r.json(); }).then(function (j) { say(j.ok ? "Opened in " + j.editor : (j.error || "Could not open editor")); }, function () { say("Could not open editor"); });
  });
  document.addEventListener("keydown", function (e) {
    var tools = window.__SR_DEVTOOLS__;
    if (e.key === "Escape" && !(tools && tools.isOpen())) location.reload();
  });
})();
</script>
<script src="/_swift-rust/hmr-client.js" defer></script>
</body>
</html>`;
}
