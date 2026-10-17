import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";
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

/**
 * Unwraps Bun.build AggregateError (`err.errors`) or failed build `logs` into a
 * clear, human-readable Error with file/line/column metadata instead of generic
 * "Bundle failed".
 */
export function normalizeBuildError(err, logs = [], cwd = process.cwd()) {
  const rawItems = [
    ...(Array.isArray(err?.errors) ? err.errors : []),
    ...(Array.isArray(logs) ? logs : []),
  ];

  if (rawItems.length === 0 && err instanceof Error && err.message !== "Bundle failed") {
    return err;
  }

  const formattedMessages = [];
  let primaryFile = err?.file || null;
  let primaryLine = err?.line || 0;
  let primaryColumn = err?.column || 0;

  for (const item of rawItems) {
    const msg = item?.message || String(item);
    const pos = item?.position;
    if (pos?.file) {
      const relFile = cwd ? relative(cwd, pos.file) : pos.file;
      const loc = `${relFile}:${pos.line || 1}:${pos.column || 1}`;
      formattedMessages.push(`${msg} (at ${loc})`);
      if (!primaryFile) {
        primaryFile = pos.file;
        primaryLine = pos.line || 1;
        primaryColumn = pos.column || 1;
      }
    } else {
      formattedMessages.push(msg);
    }
  }

  const detail =
    formattedMessages.filter(Boolean).join("\n") ||
    (err?.message && err.message !== "Bundle failed" ? err.message : "Module bundling failed — check imports and syntax in this file.");

  const out = new Error(detail);
  out.name = err?.name || "BuildError";
  if (primaryFile) out.file = primaryFile;
  if (primaryLine) out.line = primaryLine;
  if (primaryColumn) out.column = primaryColumn;
  if (err?.stack) out.stack = err.stack;
  return out;
}

export function classifyError(message, context = "") {
  if (!message) {
    return {
      kind: "error",
      code: "E0001",
      title: "Unknown error",
      explain: "An unexpected error occurred without a detail message.",
      solution: "Check the terminal logs or reload the page.",
      suggestions: ["Reload the page", "Restart `bun run dev`"],
    };
  }
  const m = `${String(message)} ${String(context)}`;

  if (/use server.*imported into.*use client|Server Component into a Client Component/i.test(m)) {
    return {
      kind: "compile",
      code: "E0404",
      title: "Server module imported inside a Client Component",
      explain:
        "A file marked with `'use client'` runs in the browser and cannot directly import a `'use server'` component.",
      solution:
        "Move the server logic into a route `loader.ts` or `action.ts` file, or remove `'use client'` from the parent page and keep `'use client'` only on interactive leaf components.",
      suggestions: [
        "Pass server data down as props from a server page or `loader.ts`",
        "For mutations, export an async function from `actions.ts` with `'use server'`",
        "Remove `'use client'` from the page if only a child component needs interactivity",
      ],
    };
  }

  if (/use static.*dynamic|set a cookie during render/i.test(m)) {
    return {
      kind: "compile",
      code: "E0405",
      title: "Static route used a dynamic feature",
      explain:
        "This route is marked `'use static'`, which guarantees build-time prerendering and CDN caching, so it cannot use request-time features like cookies, `action.ts`, or `'use node'`.",
      solution:
        "Remove `'use static'` from the top of the file if this page needs request-time data, or remove the dynamic feature (`cookies`, `action.ts`, runtime directive) to keep it static.",
      suggestions: [
        "Remove `'use static'` to allow dynamic request-time rendering",
        "Use `revalidate.ts` (ISR) if you want static caching with periodic background updates",
      ],
    };
  }

  if (/Could not resolve|Cannot find module|Module not found/i.test(m)) {
    const specMatch = String(message).match(/(?:Could not resolve|Cannot find module)[:\s]+['"]?([^'"\s\n)]+)/i);
    const missingSpec = specMatch ? specMatch[1] : null;
    const isRelative = missingSpec && (missingSpec.startsWith(".") || missingSpec.startsWith("@/"));
    return {
      kind: "compile",
      code: "E0401",
      title: missingSpec ? `Cannot find module "${missingSpec}"` : "Module not found",
      explain: missingSpec
        ? `The bundler tried to import "${missingSpec}", but no matching file or installed package was found.`
        : "The compiler could not resolve an imported module or package.",
      solution: isRelative
        ? `Verify that "${missingSpec}" exists and check the file name spelling/case.`
        : missingSpec
          ? `Install the missing package with \`bun add ${missingSpec}\` (or run \`bun run build\` if it is a workspace package).`
          : "Check the import path spelling or run `bun install` to install missing packages.",
      suggestions: [
        isRelative
          ? `Check that the file "${missingSpec}" exists (.tsx, .ts, .js)`
          : `Run \`bun install\` or \`bun add ${missingSpec || "<package>"}\``,
        "If importing a monorepo package (like `swift-rust`), run `bun run build` so `dist/` is up to date",
        "Verify `tsconfig.json` path aliases (e.g. `@/*` -> `./src/*`)",
      ],
    };
  }

  if (/Cannot declare.*twice|already been declared|SyntaxError|Unexpected token|Expected/i.test(m)) {
    return {
      kind: "compile",
      code: "E0401",
      title: "Syntax or duplicate declaration error",
      explain:
        "The file contains invalid TypeScript/JSX syntax or declares the same variable/import name twice in the same scope.",
      solution:
        "Check the highlighted line below for a duplicate identifier, unclosed JSX tag, or missing bracket.",
      suggestions: [
        "Rename or remove the duplicate import/variable declaration",
        "Check for unclosed JSX tags, missing parentheses, or stray characters",
        "Run `bun run typecheck` to see full TypeScript diagnostics",
      ],
    };
  }

  if (/is not defined|has no exported member|export.*not found|does not provide an export named/i.test(m)) {
    return {
      kind: "compile",
      code: "E0402",
      title: "Missing export or undefined symbol",
      explain:
        "You are importing or referencing a name that does not exist in the target module or current scope.",
      solution:
        "Check whether the component uses a named export (`import { X }`) vs. a default export (`import X`), and make sure it is exported from the source file.",
      suggestions: [
        "Switch between `import { Name } from '...'` and `import Name from '...'`",
        "Open the target module and confirm `export function ...` or `export const ...` is present",
        "If using a React hook (`useState`, `useEffect`), add `import { useState } from 'react'`",
      ],
    };
  }

  if (/TypeError.*is not a function|has no default export/i.test(m)) {
    return {
      kind: "compile",
      code: "E0402",
      title: "Invalid component or function export",
      explain:
        "A page, layout, or component was called as a function, but the imported value is `undefined` or an object.",
      solution:
        "Ensure your `page.tsx` or `layout.tsx` has `export default function Page() { ... }` and that all imported components match their export style.",
      suggestions: [
        "Add `export default function Page()` to your route's `page.tsx`",
        "Verify named vs. default imports for components used on this page",
      ],
    };
  }

  if (/island bundle failed|Bundle failed/i.test(m)) {
    return {
      kind: "compile",
      code: "E0403",
      title: "Client island bundle failed",
      explain:
        "The browser bundler could not package this `'use client'` component and its imports for client-side hydration.",
      solution:
        "Make sure all imports inside this `'use client'` file are browser-compatible (no `node:fs` or server-only modules) and that workspace packages are built (`bun run build`).",
      suggestions: [
        "Remove any Node-only imports (`node:fs`, `node:child_process`, database clients) from `'use client'` files",
        "Run `bun run build` if a workspace package's `dist/` folder was recently cleaned",
        "Move server-only code into `loader.ts` or `actions.ts`",
      ],
    };
  }

  if (/Failed to fetch|FetchError|NetworkError|ENOTFOUND|ECONNREFUSED/i.test(m)) {
    return {
      kind: "runtime",
      code: "E0901",
      title: "Network request failed",
      explain:
        "A `fetch()` call to an external URL or API failed because the server could not be reached.",
      solution:
        "Verify the API URL is running and reachable, and check your `.env` variables.",
      suggestions: [
        "Verify the URL protocol (`http://` vs `https://`), host, and port",
        "If calling a local backend service, confirm it is running",
        "Wrap external `fetch()` calls in `try / catch` to render a graceful fallback",
      ],
    };
  }

  if (/notFound\(\)|NEXT_NOT_FOUND|NOT_FOUND/i.test(m)) {
    return {
      kind: "notFound",
      code: "E1404",
      title: "Page or resource not found (404)",
      explain:
        "No matching route `page.tsx` was found for this URL, or `notFound()` was called during rendering.",
      solution:
        "Create an `app/<segment>/page.tsx` file for this URL, or add a custom `app/not-found.tsx` boundary.",
      suggestions: [
        "Check the URL spelling in the address bar",
        "Create `src/app/<route>/page.tsx` with `export default function Page()`",
        "Add `src/app/not-found.tsx` to customize the 404 page",
      ],
    };
  }

  if (/redirect/i.test(m)) {
    return {
      kind: "redirect",
      code: "E1301",
      title: "Redirect triggered",
      explain:
        "A `redirect()` call interrupted rendering to send the browser to another URL.",
      solution:
        "No action needed if this redirect is intentional; otherwise check the `redirect()` condition in your page, loader, or guard.",
      suggestions: [
        "Check `guard.ts`, `loader.ts`, or `page.tsx` for `redirect('/...')` calls",
      ],
    };
  }

  if (/hydration|Text content does not match|There was an error while hydrating/i.test(m)) {
    return {
      kind: "runtime",
      code: "E0501",
      title: "React hydration mismatch",
      explain:
        "The HTML rendered on the server did not match the first render in the browser.",
      solution:
        "Move browser-only or random values (`window`, `localStorage`, `Date.now()`, `Math.random()`) inside a `useEffect(...)` hook.",
      suggestions: [
        "Do not branch on `typeof window !== 'undefined'` directly inside JSX return output",
        "Use `useEffect` + `useState` for client-only values like timestamps or `localStorage`",
        "Ensure invalid HTML nesting (e.g. `<p>` inside `<p>` or `<div>` inside `<p>`) is fixed",
      ],
    };
  }

  if (/ENOSPC|EACCES|EADDRINUSE|EADDRNOTAVAIL|port.*already|port.*in use/i.test(m)) {
    return {
      kind: "system",
      code: "E0002",
      title: "Server port or system resource error",
      explain:
        "The server could not bind to the requested port or ran out of disk/file-watcher resources.",
      solution:
        "Run with `--port 3211` (or kill the existing process on port 3210 with `lsof -ti:3210 | xargs kill -9`).",
      suggestions: [
        "Free the port: `lsof -ti:3210 | xargs kill -9`",
        "Or start on another port: `bun swift-rust dev --port 3211`",
      ],
    };
  }

  return {
    kind: "error",
    code: "E0001",
    title: "Runtime error while rendering",
    explain:
      "An unhandled exception was thrown while executing your component, loader, or route handler.",
    solution:
      "Check the highlighted source line below and guard against `undefined` / `null` values before accessing properties.",
    suggestions: [
      "Inspect the source frame below to see the exact line that threw",
      "Use optional chaining (`obj?.prop`) if data can be undefined",
      "Add an `error.tsx` boundary in this route folder to handle runtime errors gracefully",
    ],
  };
}

function extractLocation(err) {
  if (!err) return null;
  if (err.file && err.line) {
    return {
      file: err.file,
      line: Number(err.line) || 1,
      column: Number(err.column) || 1,
    };
  }
  const combined = `${err.message || ""}\n${err.stack || ""}`;
  const patterns = [
    /\(at\s+([^():\n]+?\.(?:tsx?|jsx?|mjs|js)):(\d+):(\d+)\)/,
    /at\s+.*?\s+\(([^()]+?\.(?:tsx?|jsx?|mjs|js)):(\d+):(\d+)\)/,
    /at\s+([^\s()]+\.(?:tsx?|jsx?|mjs|js)):(\d+):(\d+)/,
    /([^()\s\n]+\.(?:tsx?|jsx?|mjs|js)):(\d+):(\d+)/,
  ];
  for (const p of patterns) {
    const m = combined.match(p);
    if (m && !m[1].includes("bin/dev-server.mjs") && !m[1].includes("bin/error-overlay.mjs")) {
      return {
        file: m[1],
        line: parseInt(m[2] || "0", 10),
        column: parseInt(m[3] || "0", 10),
      };
    }
  }
  if (err.lineNumber) {
    return { file: err.fileName || "<unknown>", line: err.lineNumber, column: err.columnNumber || 0 };
  }
  return null;
}

/**
 * Formats a clear, structured terminal error block with:
 *   - Error code + title
 *   - Plain-English explanation ("Why")
 *   - Exact file:line:col + code snippet
 *   - Actionable "Solution"
 */
export function formatTerminalError(err, context = "Error", cwd = process.cwd(), paint = (_c, s) => s) {
  const normalized = normalizeBuildError(err, [], cwd);
  const rawMsg = normalized?.message || String(err || "Unknown error");
  const cleanContext = context ? context.replace(cwd + "/", "") : "Error";
  const cls = classifyError(rawMsg, cleanContext);
  const loc = extractLocation(normalized);

  const lines = [];
  lines.push(
    ` ${paint("red", "✗")} ${paint("bold", `[${cls.code}] ${cls.title}`)} ${paint("dim", `(${cleanContext})`)}`,
  );

  for (const msgLine of rawMsg.split("\n").slice(0, 6)) {
    const trimmed = msgLine.replaceAll(cwd + "/", "").trim();
    if (trimmed) {
      lines.push(`│  ${paint("red", trimmed)}`);
    }
  }

  if (loc?.file) {
    const absFile = existsSync(loc.file) ? loc.file : cwd ? `${cwd}/${loc.file}` : loc.file;
    const relFile = cwd ? relative(cwd, absFile) : loc.file;
    lines.push(`│`);
    lines.push(`│  ${paint("dim", "Location:")} ${paint("cyan", `${relFile}:${loc.line}:${loc.column || 1}`)}`);
    const snippet = readFileLines(absFile, loc.line, 2);
    if (snippet && snippet.length > 0) {
      const width = String(snippet[snippet.length - 1].number).length;
      for (const s of snippet) {
        const num = String(s.number).padStart(width, " ");
        if (s.number === loc.line) {
          lines.push(`│  ${paint("red", `▶ ${num}`)} ${paint("dim", "│")} ${s.text}`);
        } else {
          lines.push(`│    ${paint("dim", `${num} │ ${s.text}`)}`);
        }
      }
    }
  }

  lines.push(`│`);
  lines.push(`│  ${paint("yellow", "💡 Solution:")} ${cls.solution || cls.suggestions?.[0] || "Check the error details above."}`);
  if (cls.suggestions && cls.suggestions.length > 1) {
    for (const tip of cls.suggestions.slice(1, 3)) {
      lines.push(`│     ${paint("dim", `• ${tip}`)}`);
    }
  }

  return {
    formatted: lines.join("\n"),
    code: cls.code,
    title: cls.title,
    message: rawMsg.replaceAll(cwd + "/", ""),
    solution: cls.solution || cls.suggestions?.[0] || "",
  };
}

function readFileLines(filePath, targetLine, context = 3) {
  try {
    if (!existsSync(filePath)) return null;
    const text = readFileSync(filePath, "utf8");
    const lines = text.split("\n");
    const start = Math.max(0, targetLine - 1 - context);
    const end = Math.min(lines.length, targetLine + context);
    const out = [];
    for (let i = start; i < end; i++) {
      out.push({ number: i + 1, text: lines[i] });
    }
    return out;
  } catch {
    return null;
  }
}

function codeFrame(filePath, line, column, context = 3) {
  if (!filePath || !line) return "";
  const lines = readFileLines(filePath, line, context);
  if (!lines || lines.length === 0) return "";
  const maxWidth = String(lines[lines.length - 1].number).length;
  const out = [];
  out.push(
    `  <div class="frame-title"><span class="frame-file">${escapeHtml(filePath)}</span>:<span class="frame-line">${line}:${column || 1}</span></div>`,
  );
  out.push(`  <pre class="frame">`);
  for (const l of lines) {
    const isTarget = l.number === line;
    const gutter = String(l.number).padStart(maxWidth, " ");
    const marker = isTarget ? "▶" : " ";
    out.push(
      `<span class="frame-line${isTarget ? " is-target" : ""}"><span class="frame-gutter">${gutter} ${marker}</span><span class="frame-source">${escapeHtml(l.text || " ")}</span></span>`,
    );
  }
  if (column && column > 0) {
    out.push(
      `<span class="frame-caret">${" ".repeat(maxWidth + 2)}<span class="caret">${" ".repeat(Math.max(0, column - 1))}^</span></span>`,
    );
  }
  out.push(`  </pre>`);
  return out.join("\n");
}

function getExplainable({ code, title, kind }) {
  return {
    code,
    title,
    intro: kind === "notFound" ? "Not Found" : kind === "redirect" ? "Redirect" : "Something went wrong",
  };
}

/**
 * @param {{ message?: string; stack?: string; hint?: string; file?: string; line?: number; column?: number; kind?: string }} [params]
 * @returns {string}
 */
export function errorOverlayHTML({ message, stack, hint, file, line, column, kind } = {}) {
  const errMsg = message || "An unexpected error occurred";
  const cls = classifyError(errMsg);
  const finalKind = kind || cls.kind;
  const finalCode = cls.code;
  const finalTitle = cls.title;
  const explain = cls.explain;
  const solution = cls.solution || hint || cls.suggestions?.[0] || "";
  const suggestions = cls.suggestions || [];

  const location = extractLocation({ message: errMsg, stack, file, line, column });
  const finalFile = file || location?.file;
  const finalLine = line || location?.line || 0;
  const finalColumn = column || location?.column || 0;
  const frame = finalFile ? codeFrame(finalFile, finalLine, finalColumn) : "";

  const headerIcon = finalKind === "notFound" ? "🔍" : finalKind === "redirect" ? "↪️" : finalKind === "compile" ? "⚙️" : "✕";

  const headerLabel =
    finalKind === "notFound"
      ? "NOT FOUND"
      : finalKind === "redirect"
        ? "REDIRECT"
        : finalKind === "compile"
          ? "COMPILER"
          : finalKind === "system"
            ? "SYSTEM"
            : "ERROR";

  const headerColor =
    finalKind === "notFound"
      ? "#a3a3a3"
      : finalKind === "redirect"
        ? "#60a5fa"
        : finalKind === "compile"
          ? "#f59e0b"
          : finalKind === "system"
            ? "#f97316"
            : "#ef4444";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Swift Rust · ${escapeHtml(finalCode)} ${escapeHtml(finalTitle)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  *, *::before, *::after { box-sizing: border-box; }
  :root {
    color-scheme: dark;
  }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", "Helvetica Neue", sans-serif;
    background: #09090b;
    color: #e4e4e7;
    min-height: 100vh;
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  .mono { font-family: ui-monospace, "SF Mono", "JetBrains Mono", "Fira Code", Menlo, Monaco, Consolas, monospace; }

  .page { max-width: 920px; margin: 0 auto; padding: 48px 24px 96px; }
  .topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding-bottom: 20px; margin-bottom: 32px;
    border-bottom: 1px solid #27272a;
  }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; }
  .brand-mark {
    width: 22px; height: 22px; border-radius: 5px;
    background: linear-gradient(135deg, #0070f3 0%, #7c3aed 50%, #ec4899 100%);
  }
  .brand-name { font-size: 14px; }
  .topbar-right { font-size: 12px; color: #71717a; }

  .card {
    background: #0c0c0d;
    border: 1px solid #27272a;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 16px;
  }
  .card-head {
    padding: 14px 20px;
    display: flex; align-items: center; gap: 12px;
    background: #111113;
    border-bottom: 1px solid #27272a;
  }
  .card-head .code-badge {
    font-family: ui-monospace, "JetBrains Mono", monospace;
    font-size: 11px; font-weight: 700; letter-spacing: 0.5px;
    background: #1f1f23; color: #e4e4e7;
    padding: 3px 8px; border-radius: 4px;
  }
  .card-head .icon { font-size: 16px; line-height: 1; }
  .card-head .title { font-size: 14px; font-weight: 600; color: #e4e4e7; }
  .card-head .kind {
    margin-left: auto;
    font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
    color: ${headerColor};
    background: ${headerColor}1A;
    border: 1px solid ${headerColor}33;
    padding: 3px 8px; border-radius: 4px;
  }
  .card-body { padding: 20px; }

  .lede {
    font-size: 16px; font-weight: 500;
    color: #fafafa;
    margin-bottom: 16px; line-height: 1.5;
  }
  .lede .err-code {
    font-family: ui-monospace, "JetBrains Mono", monospace;
    font-size: 12px;
    background: ${headerColor}1A;
    color: ${headerColor};
    padding: 2px 6px;
    border-radius: 3px;
    margin-right: 8px;
    font-weight: 600;
  }
  .explain {
    color: #a1a1aa;
    margin-bottom: 16px;
    font-size: 14px;
  }
  .section-label {
    font-size: 11px; font-weight: 600; letter-spacing: 0.5px;
    color: #71717a; text-transform: uppercase;
    margin: 20px 0 10px;
  }
  .suggestions {
    list-style: none; padding: 0; margin: 0;
    border: 1px solid #27272a; border-radius: 8px;
    overflow: hidden;
  }
  .suggestions li {
    padding: 10px 14px;
    font-size: 13px;
    color: #d4d4d8;
    background: #111113;
    border-top: 1px solid #27272a;
    display: flex; align-items: flex-start; gap: 10px;
  }
  .suggestions li:first-child { border-top: 0; }
  .suggestions li::before {
    content: "→";
    color: #60a5fa;
    font-weight: 600;
    flex-shrink: 0;
  }

  .frame {
    background: #000;
    border: 1px solid #27272a;
    border-radius: 8px;
    padding: 14px 16px;
    overflow-x: auto;
    font-size: 12.5px; line-height: 1.6;
    margin: 0;
  }
  .frame-title {
    font-family: ui-monospace, "JetBrains Mono", monospace;
    font-size: 12px;
    color: #71717a;
    margin-bottom: 8px;
    display: flex; align-items: center; gap: 4px;
  }
  .frame-file { color: #a1a1aa; }
  .frame-line { color: #71717a; }
  .frame-line { display: block; white-space: pre; }
  .frame-gutter { color: #3f3f46; user-select: none; margin-right: 12px; }
  .frame-line.is-target .frame-source { color: #fafafa; }
  .frame-line.is-target .frame-gutter { color: #ef4444; }
  .frame-caret { display: block; white-space: pre; color: #ef4444; }
  .caret { background: #ef444433; color: #ef4444; }

  .stack-wrap { margin-top: 12px; }
  details summary {
    cursor: pointer;
    color: #a1a1aa;
    font-size: 12px;
    padding: 8px 0;
    user-select: none;
    font-weight: 500;
  }
  details summary:hover { color: #e4e4e7; }
  details[open] summary { color: #fafafa; }
  pre.stack {
    background: #000;
    border: 1px solid #27272a;
    border-radius: 8px;
    padding: 14px 16px;
    overflow-x: auto;
    font-size: 12px; line-height: 1.6;
    color: #a1a1aa;
    margin: 0;
    max-height: 320px;
  }

  .hint {
    background: #1e1b4b;
    border: 1px solid #4338ca;
    color: #c7d2fe;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    margin-bottom: 16px;
  }

  .solution-box {
    background: rgba(16, 185, 129, 0.08);
    border: 1px solid rgba(16, 185, 129, 0.35);
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 16px;
  }
  .solution-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: #34d399;
    margin-bottom: 4px;
  }
  .solution-text {
    font-size: 13.5px;
    color: #ecfdf5;
    line-height: 1.5;
  }

  .actions { display: flex; gap: 8px; margin-top: 24px; flex-wrap: wrap; }
  .btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 14px; border-radius: 6px;
    font-size: 13px; font-weight: 500;
    border: 1px solid #27272a;
    background: #18181b;
    color: #e4e4e7;
    cursor: pointer;
    text-decoration: none;
    font-family: inherit;
    transition: all 0.15s ease;
  }
  .btn:hover { background: #27272a; border-color: #3f3f46; }
  .btn-primary {
    background: #fafafa;
    color: #09090b;
    border-color: #fafafa;
  }
  .btn-primary:hover { background: #e4e4e7; border-color: #e4e4e7; }

  .footer {
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid #27272a;
    display: flex; justify-content: space-between;
    font-size: 11px; color: #52525b;
  }
  .footer a { color: #71717a; text-decoration: none; }
  .footer a:hover { color: #a1a1aa; }

  @media (max-width: 640px) {
    .page { padding: 24px 16px 64px; }
    .topbar { flex-direction: column; align-items: flex-start; gap: 8px; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="topbar">
    <div class="brand">
      <div class="brand-mark"></div>
      <div class="brand-name">Swift Rust <span style="color:#71717a;font-weight:400">dev</span></div>
    </div>
    <div class="topbar-right">Press <kbd style="background:#1f1f23;border:1px solid #27272a;border-radius:3px;padding:1px 5px;font-family:ui-monospace;font-size:11px">Esc</kbd> to dismiss</div>
  </div>

  <div class="card">
    <div class="card-head">
      <span class="icon">${headerIcon}</span>
      <span class="code-badge">${escapeHtml(finalCode)}</span>
      <span class="title">${escapeHtml(finalTitle)}</span>
      <span class="kind">${escapeHtml(headerLabel)}</span>
    </div>
    <div class="card-body">
      <div class="lede">
        <span class="err-code">${escapeHtml(finalCode)}</span>
        ${escapeHtml(errMsg.split("\n")[0])}
      </div>
      <div class="explain">${escapeHtml(explain)}</div>

      ${solution ? `
        <div class="solution-box">
          <div class="solution-label">💡 How to fix this (Solution)</div>
          <div class="solution-text">${escapeHtml(solution)}</div>
        </div>
      ` : ""}

      ${hint && hint !== solution ? `<div class="hint">${escapeHtml(hint)}</div>` : ""}

      ${suggestions.length > 0 ? `
        <div class="section-label">Step-by-step checklist</div>
        <ul class="suggestions">
          ${suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}
        </ul>
      ` : ""}

      ${frame ? `
        <div class="section-label">Source</div>
        ${frame}
      ` : ""}

      ${stack ? `
        <div class="stack-wrap">
          <details>
            <summary>Stack trace</summary>
            <pre class="stack">${escapeHtml(stack)}</pre>
          </details>
        </div>
      ` : ""}

      <div class="actions">
        <button class="btn btn-primary" onclick="location.reload()">Reload page</button>
        <button class="btn" onclick="document.querySelectorAll('details').forEach(d => d.open = true)">Show all frames</button>
        <a class="btn" href="/">Go home</a>
      </div>
    </div>
  </div>

  <div class="footer">
    <div>Swift Rust v${escapeHtml(FRAMEWORK_VERSION)} · dev mode</div>
    <div><a href="https://github.com/colesites/swift-rust/issues">Report this error</a></div>
  </div>
</div>
<script>
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") location.reload();
  });
</script>
</body>
</html>`;
}
