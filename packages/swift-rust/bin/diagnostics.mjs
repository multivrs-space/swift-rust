import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

const BIN_DIR = import.meta.dirname;
const DOCS_BASE = (
  process.env.SWIFT_RUST_ERRORS_URL || "https://github.com/multivrs-space/swift-rust/blob/main/errors/docs"
).replace(/\/+$/, "");
const RESOLVE_EXTS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".json"];
const JSX_VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
]);
const BROWSER_GLOBALS = new Set([
  "window", "document", "localStorage", "sessionStorage", "navigator", "location", "history",
  "HTMLElement", "matchMedia", "requestAnimationFrame", "cancelAnimationFrame", "IntersectionObserver",
  "ResizeObserver", "MutationObserver", "alert", "confirm", "prompt", "self", "getComputedStyle",
]);
const REACT_NAMED = [
  "useState", "useEffect", "useRef", "useMemo", "useCallback", "useContext", "useReducer",
  "useLayoutEffect", "useId", "useTransition", "useDeferredValue", "useSyncExternalStore",
  "useImperativeHandle", "useInsertionEffect", "useOptimistic", "useActionState", "use", "Suspense",
  "Fragment", "StrictMode", "createContext", "forwardRef", "memo", "lazy", "startTransition",
  "cloneElement", "Children", "isValidElement", "createElement",
];
const KNOWN_IMPORTS = {
  React: { module: "react", default: true },
  Link: { module: "swift-rust/link", default: true },
  Image: { module: "swift-rust/image", default: true },
  Script: { module: "swift-rust/script", default: true },
  Head: { module: "swift-rust/head" },
  Title: { module: "swift-rust/head" },
  Meta: { module: "swift-rust/head" },
  redirect: { module: "swift-rust/router" },
  permanentRedirect: { module: "swift-rust/router" },
  notFound: { module: "swift-rust/router" },
  unauthorized: { module: "swift-rust/router" },
  forbidden: { module: "swift-rust/router" },
  rewrite: { module: "swift-rust/router" },
  useLoaderData: { module: "swift-rust/router" },
  useActionData: { module: "swift-rust/router" },
  cache: { module: "swift-rust/cache" },
  revalidateTag: { module: "swift-rust/cache" },
  revalidatePath: { module: "swift-rust/cache" },
  Form: { module: "swift-rust/action" },
  createServerAction: { module: "swift-rust/action" },
  SafeHtml: { module: "swift-rust/safe-html" },
  Video: { module: "swift-rust/video" },
};
for (const name of REACT_NAMED) KNOWN_IMPORTS[name] = { module: "react" };

export function docsUrl(code) {
  return code ? `${DOCS_BASE}/${code}.md` : null;
}

/** An error that already carries a fully-formed diagnostic. */
export class SwiftRustError extends Error {
  constructor(diagnostic, options) {
    super(diagnostic.message || diagnostic.title, options);
    this.name = "SwiftRustError";
    this.diagnostic = diagnostic;
  }
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Closest candidate within an edit-distance budget (case-insensitive match wins). */
export function closest(name, candidates, max) {
  const lower = String(name).toLowerCase();
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (!candidate || candidate === name) continue;
    const c = candidate.toLowerCase();
    if (c === lower) return candidate;
    const d = levenshtein(lower, c);
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }
  const limit = max ?? Math.max(1, Math.floor(String(name).length / 3));
  return bestDistance <= limit ? best : null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tick(s) {
  return `\`${s}\``;
}

function readText(file) {
  try {
    return existsSync(file) && statSync(file).isFile() ? readFileSync(file, "utf8") : null;
  } catch {
    return null;
  }
}

function listDir(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export function resolveModuleFile(fromDir, spec) {
  const base = resolve(fromDir, spec);
  if (isFile(base)) return base;
  for (const ext of RESOLVE_EXTS) if (isFile(base + ext)) return base + ext;
  for (const ext of RESOLVE_EXTS) if (isFile(join(base, `index${ext}`))) return join(base, `index${ext}`);
  return null;
}

function stripExt(name) {
  const ext = extname(name);
  return RESOLVE_EXTS.includes(ext) ? name.slice(0, -ext.length) : name;
}

/** Walk a relative specifier segment by segment, fixing typos/case against the disk. */
export function suggestSimilarPath(fromDir, spec) {
  const segments = spec.split("/");
  let dir = fromDir;
  const out = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === "." || seg === ".." || seg === "") {
      dir = resolve(dir, seg || ".");
      out.push(seg);
      continue;
    }
    const entries = listDir(dir);
    const last = i === segments.length - 1;
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    if (!last) {
      const pick = dirs.includes(seg) ? seg : closest(seg, dirs);
      if (!pick) return null;
      out.push(pick);
      dir = join(dir, pick);
      continue;
    }
    const files = entries.filter((e) => e.isFile()).map((e) => e.name);
    const names = [...new Set([...files.map(stripExt), ...dirs])];
    const hasExt = RESOLVE_EXTS.includes(extname(seg));
    const pool = hasExt ? files : names;
    const pick = pool.includes(seg) ? seg : closest(seg, pool);
    if (!pick) return null;
    out.push(pick);
  }
  const fixed = out.join("/");
  if (fixed === spec) return null;
  return resolveModuleFile(fromDir, fixed) ? fixed : null;
}

/** Statically collect a module's exports (good enough for "did you mean" hints). */
export function readExports(source) {
  const named = new Set();
  let hasDefault = /export\s+default\b/.test(source);
  for (const m of source.matchAll(
    /export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|enum)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    named.add(m[1]);
  }
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const p = part.trim().replace(/^type\s+/, "");
      if (!p) continue;
      const [, alias] = p.split(/\s+as\s+/);
      const out = (alias || p).trim();
      if (out === "default") hasDefault = true;
      else named.add(out);
    }
  }
  return { named: [...named], hasDefault, hasStar: /export\s*\*\s*from/.test(source) };
}

function leadingDirectiveEnd(lines) {
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t || t.startsWith("//") || /^["']use [\w-]+["'];?$/.test(t)) {
      i++;
      continue;
    }
    break;
  }
  return i;
}

/** 1-based line where a new import should be inserted (after directives + imports). */
export function importInsertLine(lines) {
  let i = leadingDirectiveEnd(lines);
  let lastImport = -1;
  for (let j = i; j < lines.length; j++) {
    const t = lines[j].trim();
    if (t.startsWith("import ") || t.startsWith("import{")) {
      let k = j;
      while (k < lines.length - 1 && !/from\s*["']|^import\s*["']/.test(lines[k].trim()) && !lines[k].includes(";")) k++;
      lastImport = k;
      j = k;
      continue;
    }
    if (t && !t.startsWith("//")) break;
  }
  return (lastImport >= 0 ? lastImport + 1 : i) + 1;
}

function importFix(lines, name, spec) {
  if (!spec.default) {
    const re = new RegExp(
      `^(\\s*import\\s+(?:[\\w$]+\\s*,\\s*)?\\{)([^}]*)(\\}\\s*from\\s*["']${escapeRe(spec.module)}["'];?\\s*)$`,
    );
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re);
      if (!m) continue;
      const names = m[2].trim().replace(/,\s*$/, "");
      return {
        message: `add ${tick(name)} to the existing import from "${spec.module}"`,
        replacement: { line: i + 1, column: 1, length: lines[i].length, text: `${m[1]} ${names ? `${names}, ` : ""}${name} ${m[3]}` },
      };
    }
  }
  const text = spec.default ? `import ${name} from "${spec.module}";` : `import { ${name} } from "${spec.module}";`;
  return { message: `consider importing ${tick(name)}`, insert: { line: importInsertLine(lines), text } };
}

function useClientFix(lines) {
  return {
    message: "mark this file as a Client Component so it runs in the browser",
    insert: { line: 1, text: "'use client';" },
    skip: lines.some((l) => /^\s*["']use client["']/.test(l)),
  };
}

/** Parse V8/JSC stack lines into frames. */
export function parseStack(stack) {
  const frames = [];
  for (const raw of String(stack || "").split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("at ")) continue;
    const m = line.match(/^at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/);
    if (!m) continue;
    const file = m[2].replace(/^file:\/\//, "").replace(/\?.*$/, "");
    frames.push({ fn: m[1] || "<anonymous>", file, line: Number(m[3]), column: Number(m[4]) });
  }
  return frames;
}

function isFrameworkFile(file) {
  return (
    !file ||
    file.startsWith(BIN_DIR) ||
    file.includes(`${sep}node_modules${sep}`) ||
    file.includes("/node_modules/") ||
    /[\\/]\.__sr_/.test(file) ||
    file.startsWith("native") ||
    file.startsWith("node:") ||
    file.startsWith("bun:") ||
    !/\.(?:tsx?|jsx?|mjs|cjs)$/.test(file)
  );
}

function absPath(file, cwd) {
  if (!file) return null;
  const clean = String(file).replace(/^file:\/\//, "").replace(/\?.*$/, "");
  const abs = isAbsolute(clean) ? clean : resolve(cwd, clean);
  if (abs.startsWith("/private/") && !cwd.startsWith("/private/") && existsSync(abs.slice(8))) return abs.slice(8);
  return abs;
}

function locate(err, cwd) {
  const pos = err?.position?.file ? err.position : err?.items?.find((i) => i?.position?.file)?.position;
  if (pos?.file) {
    return {
      absFile: absPath(pos.file, cwd),
      line: pos.line || 1,
      column: pos.column || 1,
      length: pos.length || 0,
      lineText: pos.lineText,
    };
  }
  if (err?.file && err?.line) {
    return { absFile: absPath(err.file, cwd), line: Number(err.line) || 1, column: Number(err.column) || 1, length: 0 };
  }
  const inline = String(err?.message || "").match(/\(at ([^():\n]+?\.(?:tsx?|jsx?|mjs|js)):(\d+):(\d+)\)/);
  if (inline) {
    return { absFile: absPath(inline[1], cwd), line: Number(inline[2]), column: Number(inline[3]), length: 0 };
  }
  for (const frame of parseStack(err?.stack)) {
    if (isFrameworkFile(frame.file)) continue;
    const abs = absPath(frame.file, cwd);
    if (existsSync(abs)) return { absFile: abs, line: frame.line, column: frame.column, length: 0 };
  }
  return null;
}

function unwrap(err) {
  let cur = err;
  for (let depth = 0; depth < 4 && cur; depth++) {
    if (cur.name === "RoutingFileError" && cur.cause) {
      cur = Object.assign(cur.cause instanceof Error ? cur.cause : new Error(String(cur.cause)), {
        __routingKind: cur.kind,
        __routingFile: cur.file,
      });
      continue;
    }
    if (Array.isArray(cur.errors) && cur.errors.length && !cur.items && !cur.position) {
      const first = cur.errors[0];
      cur = Object.assign(first, { items: cur.errors });
      continue;
    }
    break;
  }
  return cur;
}

function messageOf(err) {
  if (err == null) return String(err);
  if (typeof err === "string") return err;
  return String(err.message ?? err);
}

function identifierLengthAt(lineText, column) {
  const m = /^[\w$.]+/.exec(String(lineText || "").slice(Math.max(0, column - 1)));
  return m ? m[0].length : 1;
}

function relFile(abs, cwd) {
  if (!abs) return null;
  const r = relative(cwd, abs);
  return r && !r.startsWith("..") ? r.split(sep).join("/") : abs;
}

// ── Rules ────────────────────────────────────────────────────────────────────

function findDeclaration(lines, name, beforeLine) {
  const re = new RegExp(`\\b(?:const|let|var|function|class|import)\\b[^\\n]*?\\b${escapeRe(name)}\\b`);
  for (let i = 0; i < Math.min(lines.length, beforeLine - 1); i++) {
    if (re.test(lines[i])) return { line: i + 1, text: lines[i] };
  }
  return null;
}

function findUnclosedJsx(src) {
  const lineStarts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") lineStarts.push(i + 1);
  const at = (idx) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= idx) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: idx - lineStarts[lo] + 1 };
  };
  const stack = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    if (src[i] !== "<") {
      i++;
      continue;
    }
    const isClose = src[i + 1] === "/";
    const nameStart = isClose ? i + 2 : i + 1;
    const m = /^[A-Za-z][\w.:-]*/.exec(src.slice(nameStart, nameStart + 80));
    const isFragment = src[nameStart] === ">";
    if (!m && !isFragment) {
      i++;
      continue;
    }
    if (!isClose && stack.length === 0) {
      let j = i - 1;
      while (j >= 0 && /\s/.test(src[j])) j--;
      const prev = j >= 0 ? src[j] : "";
      const word = src.slice(Math.max(0, j - 5), j + 1);
      if (!(prev === "" || /[(\[{=?:,>&|]/.test(prev) || /return$/.test(word))) {
        i++;
        continue;
      }
    }
    const name = isFragment ? "" : m[0];
    let k = nameStart + name.length;
    let depth = 0;
    let quote = null;
    while (k < n) {
      const c = src[k];
      if (quote) {
        if (c === quote && src[k - 1] !== "\\") quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth <= 0) break;
      k++;
    }
    const selfClosing = src[k - 1] === "/";
    if (isClose) {
      const top = stack[stack.length - 1];
      if (top && top.name === name) stack.pop();
      else if (top && stack.some((s) => s.name === name)) {
        return { kind: "mismatch", tag: top.name, found: name, ...at(top.idx), close: at(i) };
      }
    } else if (!selfClosing && !JSX_VOID.has(name)) {
      stack.push({ name, idx: i });
    }
    i = k + 1;
  }
  const top = stack[stack.length - 1];
  return top ? { kind: "unclosed", tag: top.name, ...at(top.idx) } : null;
}

function bracketImbalance(src) {
  const s = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{}()])\/\/[^\n]*/gm, "$1")
    .replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g, '""');
  const pairs = [["{", "}"], ["(", ")"], ["[", "]"]];
  for (const [open, close] of pairs) {
    const o = s.split(open).length - 1;
    const c = s.split(close).length - 1;
    if (o !== c) return { open, close, o, c };
  }
  return null;
}

function syntaxRule(ctx) {
  const { message, location, lines } = ctx;
  if (!location || ctx.err?.specifier) return null;
  const isParse =
    ctx.err?.name === "BuildMessage" ||
    ctx.err?.name === "SyntaxError" ||
    /Syntax Error|Unexpected|Expected|already been declared|Unterminated|Parse error/i.test(message);
  if (!isParse || /does not provide an export|Export named/.test(message)) return null;

  const dup = message.match(/"(.+?)" has already been declared|Identifier '(.+?)' has already been declared|Cannot declare "(.+?)" twice/);
  if (dup) {
    const name = dup[1] || dup[2] || dup[3];
    const prev = findDeclaration(lines, name, location.line);
    const helps = [];
    const cur = lines[location.line - 1] || "";
    if (prev && cur.trim().startsWith("import") && prev.text.trim().startsWith("import")) {
      helps.push({ message: "remove the duplicate import", remove: { line: location.line } });
    } else {
      helps.push({ message: `rename one of the declarations, or delete the one you no longer need` });
    }
    return {
      code: "SR0003",
      kind: "compile",
      title: `the name ${tick(name)} is defined multiple times`,
      label: `${tick(name)} redefined here`,
      length: name.length,
      notes: [
        prev ? `previous definition of ${tick(name)} is on line ${prev.line}: ${tick(prev.text.trim())}` : null,
        `${tick(name)} must be defined only once in this module`,
      ],
      helps,
    };
  }

  const isJsxFile = /\.(?:tsx|jsx)$/.test(location.absFile || "");
  const jsx = isJsxFile && ctx.source ? findUnclosedJsx(ctx.source) : null;
  if (jsx && /Syntax Error|end of file|closing|Unterminated|Expected|Unexpected/i.test(message)) {
    const tag = jsx.tag ? `<${jsx.tag}>` : "<>";
    const close = jsx.tag ? `</${jsx.tag}>` : "</>";
    return {
      code: "SR0003",
      kind: "compile",
      title: `unclosed JSX element ${tick(tag)}`,
      location: { line: jsx.line, column: jsx.column, length: tag.length - 1 },
      label: jsx.kind === "mismatch" ? `${tick(tag)} opened here` : `this ${tick(tag)} is never closed`,
      notes: [
        jsx.kind === "mismatch"
          ? `found ${tick(`</${jsx.found}>`)} on line ${jsx.close.line} while ${tick(tag)} was still open`
          : "every JSX element needs a closing tag or must self-close (`<br />`)",
        `the parser reported: ${message.split("\n")[0]}`,
      ],
      helps: [{ message: `add ${tick(close)} where the ${tick(tag)} element should end` }],
    };
  }

  const expected = message.match(/Expected "(.+?)" but found "(.*?)"/);
  const imbalance = ctx.source ? bracketImbalance(ctx.source) : null;
  const notes = [];
  if (imbalance) {
    notes.push(
      imbalance.o > imbalance.c
        ? `this file opens ${imbalance.o} ${tick(imbalance.open)} but only closes ${imbalance.c}`
        : `this file closes ${imbalance.c} ${tick(imbalance.close)} but only opens ${imbalance.o}`,
    );
  }
  if (expected) {
    return {
      code: "SR0003",
      kind: "compile",
      title: `expected ${tick(expected[1])}, found ${tick(expected[2] || "end of file")}`,
      label: `expected ${tick(expected[1])}`,
      notes,
      helps: [{ message: `insert ${tick(expected[1])} before ${tick(expected[2] || "the end of the file")}` }],
    };
  }
  const unterminated = message.match(/Unterminated (string|template|regular expression|JSX)/i);
  if (unterminated) {
    return {
      code: "SR0003",
      kind: "compile",
      title: `unterminated ${unterminated[1].toLowerCase()} literal`,
      label: "starts here and never ends",
      notes,
      helps: [{ message: "add the matching closing quote" }],
    };
  }
  const eof = /end of file|Syntax Error/i.test(message);
  return {
    code: "SR0003",
    kind: "compile",
    title: eof ? "unexpected end of file" : lowerFirst(message.split("\n")[0]),
    label: eof ? "the parser stopped here" : "unexpected token",
    notes,
    helps: [
      {
        message: imbalance
          ? `add the missing ${tick(imbalance.o > imbalance.c ? imbalance.close : imbalance.open)}`
          : "look for a missing `}`, `)` or closing JSX tag just before this point",
      },
    ],
  };
}

function lowerFirst(s) {
  const t = String(s).replace(/^(?:Error|SyntaxError|TypeError|ReferenceError):\s*/, "").trim();
  return t ? t[0].toLowerCase() + t.slice(1) : t;
}

function missingExportRule(ctx) {
  const m =
    ctx.message.match(/No matching export in "(.+?)" for import "(.+?)"/) ||
    ctx.message.match(/The requested module '(.+?)' does not provide an export named '(.+?)'/) ||
    ctx.message.match(/Export named '(.+?)' not found in module '(.+?)'/);
  if (!m) return null;
  let [target, name] = [m[1], m[2]];
  if (/^Export named/.test(m[0])) [name, target] = [m[1], m[2]];
  const importer = ctx.location?.absFile;
  const targetAbs =
    (importer && !isAbsolute(target) && resolveModuleFile(dirname(importer), target)) ||
    resolveModuleFile(ctx.cwd, target) ||
    (isAbsolute(target) ? target : null);
  const src = targetAbs ? readText(targetAbs) : null;
  const exp = src ? readExports(src) : null;
  const targetRel = targetAbs ? relFile(targetAbs, ctx.cwd) : target;
  const helps = [];
  const notes = [];
  if (exp) {
    const similar = closest(name, exp.named);
    const lineText = ctx.location?.lineText ?? ctx.lines[(ctx.location?.line || 1) - 1] ?? "";
    if (similar) {
      const col = lineText.indexOf(name) + 1;
      helps.push({
        message: `a similar export exists: ${tick(similar)}`,
        replacement: col > 0 ? { line: ctx.location.line, column: col, length: name.length, text: similar } : undefined,
      });
    }
    if (exp.hasDefault && !exp.named.includes(name)) {
      const braces = new RegExp(`\\{\\s*${escapeRe(name)}\\s*\\}`).exec(lineText);
      helps.push({
        message: `${tick(targetRel)} has a default export — import it without braces`,
        replacement: braces ? { line: ctx.location.line, column: braces.index + 1, length: braces[0].length, text: name } : undefined,
      });
    }
    if (!similar && !exp.hasDefault && exp.named.length === 0) {
      helps.push({ message: `add ${tick(`export function ${name}() { … }`)} to ${tick(targetRel)}` });
    }
    const list = [...exp.named.map(tick), ...(exp.hasDefault ? ["`default`"] : [])];
    if (list.length) notes.push(`${tick(targetRel)} exports: ${list.slice(0, 8).join(", ")}${list.length > 8 ? ", …" : ""}`);
  }
  if (!helps.length) helps.push({ message: `export ${tick(name)} from ${tick(targetRel)}, or fix the import name` });
  return {
    code: "SR0003",
    kind: "compile",
    title: `unresolved import ${tick(name)}`,
    label: `no ${tick(name)} export in ${tick(targetRel)}`,
    length: name.length,
    notes,
    helps,
  };
}

function readPackageDeps(cwd) {
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
    return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies });
  } catch {
    return [];
  }
}

function aliasBase(cwd, spec) {
  try {
    const raw = readFileSync(join(cwd, "tsconfig.json"), "utf8").replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, "$1");
    const paths = JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1"))?.compilerOptions?.paths || {};
    for (const [key, targets] of Object.entries(paths)) {
      const prefix = key.replace(/\*$/, "");
      if (prefix && spec.startsWith(prefix) && Array.isArray(targets) && targets[0]) {
        return { prefix, dir: resolve(cwd, String(targets[0]).replace(/\*$/, "")) };
      }
    }
  } catch {}
  if (spec.startsWith("@/")) return { prefix: "@/", dir: existsSync(join(cwd, "src")) ? join(cwd, "src") : cwd };
  if (spec.startsWith("~/")) return { prefix: "~/", dir: existsSync(join(cwd, "src")) ? join(cwd, "src") : cwd };
  return null;
}

function moduleNotFoundRule(ctx) {
  const m =
    ctx.message.match(/Could not resolve:?\s*"(.+?)"/) ||
    ctx.message.match(/Cannot find (?:module|package) '(.+?)'(?: from '(.+?)')?/) ||
    ctx.message.match(/Module not found:?\s*(?:Error:\s*)?(?:Can't resolve\s*)?'(.+?)'/);
  if (!m) return null;
  const spec = ctx.err?.specifier || m[1];
  const importerAbs = ctx.location?.absFile || (m[2] ? absPath(m[2], ctx.cwd) : null);
  const lineText = ctx.location?.lineText ?? (ctx.location ? ctx.lines[ctx.location.line - 1] : "") ?? "";
  const specCol = lineText ? lineText.indexOf(spec) + 1 : 0;
  const helps = [];
  const notes = [];
  const isRelative = spec.startsWith("./") || spec.startsWith("../");
  const alias = !isRelative ? aliasBase(ctx.cwd, spec) : null;
  let label = "no file or package matches this path";

  if ((isRelative || alias) && importerAbs) {
    const baseDir = isRelative ? dirname(importerAbs) : alias.dir;
    const rest = isRelative ? spec : `./${spec.slice(alias.prefix.length)}`;
    const fixedRest = suggestSimilarPath(baseDir, rest);
    if (fixedRest) {
      const fixed = isRelative ? fixedRest : alias.prefix + fixedRest.replace(/^\.\//, "");
      const caseOnly = fixed.toLowerCase() === spec.toLowerCase();
      helps.push({
        message: caseOnly
          ? "the file exists with different letter casing — paths are case-sensitive on Linux and in production"
          : "a file with a similar name exists",
        replacement: specCol > 0 ? { line: ctx.location.line, column: specCol, length: spec.length, text: fixed } : undefined,
      });
    } else {
      const target = relFile(resolve(baseDir, rest), ctx.cwd);
      helps.push({ message: `create ${tick(`${target}.tsx`)} or correct the path` });
    }
    notes.push(`looked for ${RESOLVE_EXTS.slice(0, 4).join(", ")} files and ${tick("index")} files`);
  } else {
    const pkgName = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    const bare = pkgName.replace(/^node:/, "");
    const isBuiltin = spec.startsWith("node:") || builtinModules.includes(bare);
    const deps = readPackageDeps(ctx.cwd);
    if (isBuiltin) {
      label = `${tick(spec)} only exists on the server`;
      notes.push("this file is bundled for the browser because it (or a file that imports it) is marked `'use client'`");
      helps.push({ message: "move the Node.js code into `loader.ts`, `action.ts`, or a server component and pass the result down as props" });
    } else if (pkgName === "swift-rust" || pkgName.startsWith("@swift-rust/")) {
      helps.push({ message: `the workspace package ${tick(pkgName)} has no build output yet`, command: "bun run build" });
    } else if (deps.includes(pkgName)) {
      label = `${tick(pkgName)} is in package.json but not installed`;
      helps.push({ message: "install your dependencies", command: "bun install" });
    } else {
      label = `${tick(pkgName)} is not installed`;
      const similar = closest(pkgName, deps, 2);
      if (similar) {
        helps.push({
          message: `a package with a similar name is installed: ${tick(similar)}`,
          replacement:
            specCol > 0 ? { line: ctx.location.line, column: specCol, length: pkgName.length, text: similar } : undefined,
        });
      }
      helps.push({ message: `add ${tick(pkgName)} to your dependencies`, command: `bun add ${pkgName}` });
    }
  }
  return {
    code: "SR0093",
    kind: "compile",
    title: `cannot find module ${tick(spec)}`,
    label,
    column: specCol > 0 ? specCol : undefined,
    length: specCol > 0 ? spec.length : undefined,
    notes,
    helps,
  };
}

function referenceRule(ctx) {
  const m = ctx.message.match(/^(?:ReferenceError:\s*)?([A-Za-z_$][\w$]*) is not defined/) || ctx.message.match(/Can't find variable: ([A-Za-z_$][\w$]*)/);
  if (!m) return null;
  const name = m[1];
  const lineText = ctx.location ? ctx.lines[ctx.location.line - 1] || "" : "";
  const col = lineText ? new RegExp(`\\b${escapeRe(name)}\\b`).exec(lineText) : null;
  const where = col ? { column: col.index + 1, length: name.length } : { length: name.length };
  if (BROWSER_GLOBALS.has(name)) {
    return {
      code: "SR0005",
      kind: "runtime",
      title: `${tick(name)} is not available during server rendering`,
      label: `${tick(name)} is used while the page renders on the server`,
      ...where,
      notes: ["every page is rendered to HTML on the server first, where browser globals don't exist"],
      helps: [
        {
          message: "read it inside `useEffect`, which only runs in the browser",
          snippet: `useEffect(() => {\n  // ${name} is safe to use here\n}, []);`,
        },
        { message: `or guard the access: ${tick(`typeof ${name} !== "undefined"`)}` },
      ],
    };
  }
  const helps = [];
  const known = KNOWN_IMPORTS[name];
  if (known && ctx.lines.length) helps.push(importFix(ctx.lines, name, known));
  else if (ctx.source) {
    const ids = new Set();
    for (const d of ctx.source.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) ids.add(d[1]);
    for (const d of ctx.source.matchAll(/import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from/g)) {
      if (d[1]) ids.add(d[1]);
      for (const part of (d[2] || "").split(",")) {
        const id = part.split(/\s+as\s+/).pop()?.trim();
        if (id) ids.add(id);
      }
    }
    const similar = closest(name, [...ids, ...Object.keys(KNOWN_IMPORTS)]);
    if (similar) {
      helps.push({
        message: `a name with a similar spelling exists: ${tick(similar)}`,
        replacement: col ? { line: ctx.location.line, column: col.index + 1, length: name.length, text: similar } : undefined,
      });
    }
  }
  if (!helps.length) helps.push({ message: `declare ${tick(name)} or import it from the module that defines it` });
  return {
    code: "SR0003",
    kind: "runtime",
    title: `cannot find value ${tick(name)} in this scope`,
    label: "not found in this scope",
    ...where,
    helps,
  };
}

function nullishPropertyRule(ctx) {
  const jsc = ctx.message.match(/(undefined|null) is not an object \(evaluating '(.+?)'\)/);
  const v8 = ctx.message.match(/Cannot read propert(?:y|ies) of (undefined|null) \(reading '(.+?)'\)/);
  if (!jsc && !v8) return null;
  const nullish = (jsc || v8)[1];
  let expr = jsc ? jsc[2] : null;
  let prop = v8 ? v8[2] : null;
  if (expr) {
    const dot = expr.lastIndexOf(".");
    const bracket = expr.lastIndexOf("[");
    const cut = Math.max(dot, bracket);
    prop = cut > 0 ? expr.slice(cut + 1).replace(/[\]'"]/g, "") : expr;
    expr = cut > 0 ? expr.slice(0, cut) : expr;
  }
  const lineText = ctx.location ? ctx.lines[ctx.location.line - 1] || "" : "";
  let obj = expr && !/^\(void 0\)|^\(null\)/.test(expr) ? expr : null;
  if (!obj && lineText && prop) {
    const found = new RegExp(`([\\w$][\\w$.]*?)\\.${escapeRe(prop)}\\b`).exec(lineText);
    if (found) obj = found[1];
  }
  const access = obj ? `${obj}.${prop}` : null;
  const idx = access && lineText ? lineText.indexOf(access) : -1;
  const helps = [];
  if (idx >= 0) {
    helps.push({
      message: `use optional chaining so the expression evaluates to ${tick("undefined")} instead of throwing`,
      replacement: { line: ctx.location.line, column: idx + obj.length + 1, length: 1, text: "?." },
    });
  }
  helps.push({ message: `or make sure ${obj ? tick(obj) : "the value"} is loaded before rendering (e.g. return a fallback while it is ${tick(nullish)})` });
  return {
    code: "SR0005",
    kind: "runtime",
    title: `cannot read ${tick(prop)} of ${tick(nullish)}`,
    label: obj ? `${tick(obj)} is ${tick(nullish)} here` : `this value is ${tick(nullish)}`,
    column: idx >= 0 ? idx + 1 : undefined,
    length: idx >= 0 ? obj.length : undefined,
    notes: ["this usually means data hasn't loaded yet, a prop wasn't passed, or an API returned a different shape than expected"],
    helps,
  };
}

function notAFunctionRule(ctx) {
  const m = ctx.message.match(/^(?:TypeError:\s*)?(.+?) is not a function/);
  if (!m) return null;
  let name = m[1].replace(/^\(\{\}\)\./, "").trim();
  const inner = ctx.message.match(/In '.+?', '(.+?)' is (undefined|null|an instance of \w+)/);
  const what = inner ? inner[2] : "not a function";
  const lineText = ctx.location ? ctx.lines[ctx.location.line - 1] || "" : "";
  const helps = [];
  const notes = [];
  const arrayMethod = name.match(/^(.*)\.(map|filter|forEach|reduce|find|findIndex|some|every|flatMap|join|includes|slice|sort)$/);
  if (arrayMethod) {
    const obj = arrayMethod[1] || "value";
    const call = `${obj}.${arrayMethod[2]}(`;
    const idx = lineText.indexOf(call);
    notes.push(`${tick(arrayMethod[2])} only exists on arrays, so ${tick(obj)} is not an array here`);
    helps.push({
      message: `default ${tick(obj)} to an empty array when it is missing`,
      replacement: idx >= 0 ? { line: ctx.location.line, column: idx + 1, length: obj.length, text: `(${obj} ?? [])` } : undefined,
    });
    return { code: "SR0005", kind: "runtime", title: `${tick(name)} is not a function`, label: `${tick(obj)} is not an array`, column: idx >= 0 ? idx + 1 : undefined, length: idx >= 0 ? obj.length : undefined, notes, helps };
  }
  if (REACT_NAMED.includes(name)) {
    notes.push(`${tick(name)} is missing from the installed React — it may require a newer version`);
    helps.push({ message: "upgrade React", command: "bun add react@latest react-dom@latest" });
    return { code: "SR0134", kind: "runtime", title: `${tick(name)} is not a function`, label: `${tick(name)} is ${what}`, notes, helps };
  }
  const imp = ctx.source
    ? new RegExp(`import\\s+(?:(${escapeRe(name)})\\s*(?:,|from)|[^;]*\\{[^}]*\\b${escapeRe(name)}\\b[^}]*\\})[^;]*?from\\s*["'](.+?)["']`).exec(ctx.source)
    : null;
  if (imp && ctx.location && (imp[2].startsWith(".") || imp[2].startsWith("@/"))) {
    const base = imp[2].startsWith("@/") ? aliasBase(ctx.cwd, imp[2]) : null;
    const target = base
      ? resolveModuleFile(base.dir, `./${imp[2].slice(2)}`)
      : resolveModuleFile(dirname(ctx.location.absFile), imp[2]);
    const exp = target ? readExports(readText(target) || "") : null;
    if (exp) {
      const isDefaultImport = Boolean(imp[1]);
      if (isDefaultImport && !exp.hasDefault && exp.named.includes(name)) {
        helps.push({ message: `${tick(imp[2])} has no default export — use a named import: ${tick(`import { ${name} } from "${imp[2]}"`)}` });
      } else if (!isDefaultImport && !exp.named.includes(name) && exp.hasDefault) {
        helps.push({ message: `${tick(imp[2])} only has a default export — use ${tick(`import ${name} from "${imp[2]}"`)}` });
      }
    }
  }
  if (!helps.length) helps.push({ message: `check what ${tick(name)} actually is at this point — log it with ${tick(`console.log(typeof ${name.split(".")[0]})`)}` });
  return { code: "SR0005", kind: "runtime", title: `${tick(name)} is not a function`, label: `${tick(name)} is ${what}`, notes, helps };
}

function reactRule(ctx) {
  const msg = ctx.message;
  if (/Element type is invalid/.test(msg)) {
    const helps = [];
    const notes = [];
    const files = [ctx.pageFile, ...(ctx.layoutFiles || [])].filter(Boolean);
    for (const file of files) {
      const src = readText(file);
      if (!src) continue;
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const im = lines[i].match(/^\s*import\s+(?:([A-Z][\w$]*)|\{([^}]*)\})\s+from\s*["'](\.{1,2}\/[^"']+|@\/[^"']+)["']/);
        if (!im) continue;
        const base = im[3].startsWith("@/") ? aliasBase(ctx.cwd, im[3]) : null;
        const target = base ? resolveModuleFile(base.dir, `./${im[3].slice(2)}`) : resolveModuleFile(dirname(file), im[3]);
        const exp = target ? readExports(readText(target) || "") : null;
        if (!exp) continue;
        if (im[1] && !exp.hasDefault && exp.named.includes(im[1])) {
          helps.push({
            message: `${tick(im[3])} has no default export — import ${tick(im[1])} by name`,
            file: relFile(file, ctx.cwd),
            replacement: { line: i + 1, column: 1, length: lines[i].length, text: lines[i].replace(im[1], `{ ${im[1]} }`) },
          });
        } else if (im[2]) {
          for (const raw of im[2].split(",")) {
            const id = raw.trim().split(/\s+as\s+/)[0];
            if (/^[A-Z]/.test(id) && !exp.named.includes(id) && exp.hasDefault) {
              helps.push({
                message: `${tick(im[3])} exports ${tick(id)} as its default export — import it without braces`,
                file: relFile(file, ctx.cwd),
                replacement: { line: i + 1, column: 1, length: lines[i].length, text: lines[i].replace(`{${im[2]}}`, id) },
              });
            }
          }
        }
        if (helps.length >= 2) break;
      }
    }
    const got = msg.match(/but got: (\w+)/);
    notes.push("you probably forgot to export a component, or mixed up default and named imports");
    if (!helps.length) helps.push({ message: "check each component import on this page: `import X from` needs `export default`, `import { X } from` needs `export function X`" });
    return { code: "SR0080", kind: "runtime", title: `a component on this page is ${tick(got ? got[1] : "undefined")}`, label: "rendered here", notes, helps };
  }
  const child = msg.match(/Objects are not valid as a React child \(found: (.+?)\)/);
  if (child) {
    return {
      code: "SR0003",
      kind: "runtime",
      title: "objects can't be rendered as JSX children",
      label: "an object is rendered here",
      notes: [`found ${child[1]}`],
      helps: [{ message: "render a field of the object (`{user.name}`), map over an array, or show it with `{JSON.stringify(value)}`" }],
    };
  }
  if (/Invalid hook call|Hooks can only be called inside/.test(msg)) {
    return {
      code: "SR0132",
      kind: "runtime",
      title: "invalid hook call",
      label: "hook called here",
      notes: ["hooks must be called at the top level of a function component, not inside loops, conditions, or regular functions"],
      helps: [{ message: "move the hook call to the top of your component's body" }],
    };
  }
  if (/reading '(?:useState|useEffect|useRef|useContext|useReducer|useMemo)'/.test(msg)) {
    return {
      code: "SR0075",
      kind: "runtime",
      title: "React hooks failed: more than one copy of React is loaded",
      label: "hook called here",
      notes: ["the page and a dependency resolved different copies of `react`"],
      helps: [{ message: "check which versions are installed", command: "bun pm ls react" }, { message: "make every package share one React", command: "bun install" }],
    };
  }
  if (/async\/await is not (?:yet )?supported in Client Components|async Client Component/i.test(msg)) {
    return {
      code: "SR0104",
      kind: "runtime",
      title: "Client Components can't be async",
      helps: [{ message: "remove `async` and fetch the data in `loader.ts`, then read it with `useLoaderData()`" }],
    };
  }
  if (/createContext is not a function|createContext only works in Client Components/.test(msg)) {
    const fix = useClientFix(ctx.lines);
    return {
      code: "SR0029",
      kind: "runtime",
      title: "`createContext` can only be used in a Client Component",
      label: "context created here",
      helps: fix.skip ? [{ message: "move the provider into its own `'use client'` file" }] : [fix],
    };
  }
  if (/hydrat|Text content does not match|did not match/i.test(msg)) {
    return {
      code: "SR0133",
      kind: "runtime",
      title: "hydration mismatch: the server HTML didn't match the first client render",
      notes: ["values like `Date.now()`, `Math.random()`, `window` or `localStorage` produce different output on the server and in the browser"],
      helps: [
        { message: "compute browser-only values inside `useEffect` and store them in state" },
        { message: "check for invalid HTML nesting such as `<div>` inside `<p>`" },
      ],
    };
  }
  if (/Converting circular structure to JSON|cyclic object value|JSON\.stringify cannot serialize cyclic/i.test(msg)) {
    return {
      code: "SR0024",
      kind: "runtime",
      title: "props contain a circular reference",
      notes: ["props passed to `'use client'` components are serialized to JSON, which can't represent cycles"],
      helps: [{ message: "pass only the plain fields the component needs (ids, strings, numbers) instead of the whole object" }],
    };
  }
  return null;
}

function systemRule(ctx) {
  const err = ctx.err || {};
  const code = err.code || (ctx.message.match(/\b(E[A-Z]{3,})\b/) || [])[1];
  if (code === "EADDRINUSE" || /port .*(?:in use|already)/i.test(ctx.message)) {
    const port = err.port || (ctx.message.match(/:(\d{2,5})\b/) || [])[1] || "3210";
    return {
      code: "SR0137",
      kind: "system",
      title: `port ${tick(port)} is already in use`,
      helps: [
        { message: "start on another port", command: `bun swift-rust dev --port ${Number(port) + 1}` },
        { message: "or stop the process using it", command: `lsof -ti:${port} | xargs kill` },
      ],
    };
  }
  if (code === "EACCES" || code === "EPERM") {
    return {
      code: "SR0009",
      kind: "system",
      title: `permission denied${err.path ? `: ${tick(relFile(err.path, ctx.cwd))}` : ""}`,
      helps: [{ message: "check that your user can read and write this path" }],
    };
  }
  if (code === "ENOENT" && err.path) {
    return {
      code: "SR0009",
      kind: "system",
      title: `no such file or directory: ${tick(relFile(err.path, ctx.cwd))}`,
      helps: [{ message: "create the file, or fix the path that points to it" }],
    };
  }
  if (code === "EMFILE" || code === "ENOSPC") {
    return {
      code: "SR0009",
      kind: "system",
      title: "the system ran out of file watchers",
      helps: [
        { message: "raise the open-file limit", command: "ulimit -n 10240" },
        { message: "on Linux, raise the inotify watcher limit", command: "sudo sysctl fs.inotify.max_user_watches=524288" },
      ],
    };
  }
  if (/dev server did not become ready/i.test(ctx.message)) {
    return {
      code: "SR0005",
      kind: "system",
      title: "the prerender server did not become ready",
      notes: ["`swift-rust build` starts a temporary dev server to render each page"],
      helps: [
        { message: "read the dev server output above — the page error is printed there" },
        { message: "confirm the app starts on its own", command: "bun swift-rust dev" },
      ],
    };
  }
  if (/dev server exited unexpectedly/i.test(ctx.message)) {
    return {
      code: "SR0005",
      kind: "system",
      title: "the prerender server exited before the build finished",
      helps: [{ message: "the exit log above is the real error — fix that, then rebuild" }],
    };
  }
  if (/requires Bun/i.test(ctx.message)) {
    return {
      code: "SR0073",
      kind: "system",
      title: "Bun is required to build and serve this app",
      helps: [{ message: "install Bun 1.3.0 or newer and make sure `bun` is on PATH", command: "curl -fsSL https://bun.sh/install | bash" }],
    };
  }
  const net = /ECONNREFUSED|ENOTFOUND|ECONNRESET|ETIMEDOUT|Unable to connect|fetch failed|Failed to fetch|NetworkError/i.test(ctx.message) || ["ECONNREFUSED", "ENOTFOUND", "ConnectionRefused"].includes(code);
  if (net) {
    const host = (ctx.message.match(/(?:https?:\/\/)?([\w.-]+:\d{2,5}|[\w-]+\.[\w.-]+)/) || [])[1];
    return {
      code: "SR0005",
      kind: "runtime",
      title: host ? `could not connect to ${tick(host)}` : "a network request failed",
      label: "request made here",
      notes: ["the server didn't respond — it may be down, the URL may be wrong, or an environment variable may be missing"],
      helps: [
        { message: "make sure the service is running and the URL (protocol, host, port) is correct" },
        { message: "wrap the request in `try`/`catch` and render a fallback so one failing API doesn't crash the page" },
      ],
    };
  }
  if (/JSON Parse error|Unexpected token .* in JSON|is not valid JSON/i.test(ctx.message)) {
    const html = /Unexpected token '?<|"<!DOCTYPE|Unrecognized token '<'/i.test(ctx.message);
    return {
      code: "SR0005",
      kind: "runtime",
      title: "failed to parse JSON",
      label: "parsed here",
      notes: [html ? "the response was HTML (probably an error page), not JSON" : "the text being parsed is not valid JSON"],
      helps: [{ message: "check the response before parsing it", snippet: "const res = await fetch(url);\nif (!res.ok) throw new Error(`Request failed: ${res.status}`);\nconst data = await res.json();" }],
    };
  }
  return null;
}

function bundleRule(ctx) {
  if (!/island bundle failed|Bundle failed|Module bundling failed/i.test(`${ctx.message} ${ctx.context || ""}`)) return null;
  return {
    code: "SR0004",
    kind: "compile",
    title: "the browser bundle for this Client Component failed to build",
    notes: ["`'use client'` files and everything they import are bundled for the browser"],
    helps: [
      { message: "remove Node-only imports (`node:fs`, database clients) from `'use client'` files" },
      { message: "if a workspace package was cleaned, rebuild it", command: "bun run build" },
    ],
  };
}

const RULES = [moduleNotFoundRule, missingExportRule, syntaxRule, referenceRule, nullishPropertyRule, reactRule, notAFunctionRule, systemRule, bundleRule];

function fallback(ctx) {
  const first = ctx.message.split("\n").find((l) => l.trim()) || "unknown error";
  const helps = [];
  if (ctx.pageFile && !ctx.errorFile && !ctx.location?.lineText) {
    const dir = relFile(dirname(ctx.pageFile), ctx.cwd);
    helps.push({ message: `add ${tick(`${dir}/error.tsx`)} to show a fallback UI instead of this overlay in production` });
  }
  return {
    code: ctx.location?.lineText ? "SR0003" : "SR0005",
    kind: ctx.location?.lineText ? "compile" : "runtime",
    title: lowerFirst(first),
    label: "thrown here",
    helps,
  };
}

// ── Finalize ─────────────────────────────────────────────────────────────────

function computeDiff(help, lines, location) {
  const lineAt = (n) => lines[n - 1] ?? (location && location.line === n ? location.lineText : undefined);
  if (help.replacement) {
    const { line, column, length, text } = help.replacement;
    const old = lineAt(line);
    if (old == null) return null;
    const next = old.slice(0, column - 1) + text + old.slice(column - 1 + length);
    let p = 0;
    while (p < old.length && p < next.length && old[p] === next[p]) p++;
    let s = 0;
    while (s < old.length - p && s < next.length - p && old[old.length - 1 - s] === next[next.length - 1 - s]) s++;
    return [
      { type: "-", n: line, text: old, mark: [p, old.length - s] },
      { type: "+", n: line, text: next, mark: [p, next.length - s] },
    ];
  }
  if (help.insert) {
    return help.insert.text.split("\n").map((text, i) => ({ type: "+", n: help.insert.line + i, text, mark: [0, text.length] }));
  }
  if (help.remove) {
    const old = lineAt(help.remove.line);
    return old == null ? null : [{ type: "-", n: help.remove.line, text: old, mark: [0, old.length] }];
  }
  return null;
}

function cleanStack(stack, cwd) {
  if (!stack) return "";
  return String(stack)
    .split("\n")
    .filter((l) => !/[\\/]\.__sr_|\(native\)|node:internal/.test(l))
    .join("\n")
    .replaceAll(`${cwd}/`, "");
}

function finalize(d, ctx, opts) {
  const cwd = ctx.cwd;
  const loc = ctx.location;
  const location = loc
    ? {
        absFile: loc.absFile,
        file: relFile(loc.absFile, cwd),
        line: d.location?.line ?? loc.line,
        column: d.location?.column ?? d.column ?? loc.column,
        length: d.location?.length ?? d.length ?? loc.length,
      }
    : d.location?.absFile
      ? { ...d.location, file: relFile(d.location.absFile, cwd) }
      : null;
  if (location) {
    location.lineText = ctx.lines[location.line - 1] ?? (loc && loc.line === location.line ? loc.lineText : undefined) ?? "";
    if (!location.length) location.length = identifierLengthAt(location.lineText, location.column);
  }
  const sourceLines = location?.absFile && location.absFile !== loc?.absFile ? (readText(location.absFile) || "").split("\n") : ctx.lines;
  let frame = null;
  if (location && sourceLines.length) {
    const start = Math.max(1, location.line - 3);
    const end = Math.min(sourceLines.length, location.line + 3);
    frame = { start, lines: sourceLines.slice(start - 1, end) };
  } else if (location?.lineText) {
    frame = { start: location.line, lines: [location.lineText] };
  }
  const helps = (d.helps || [])
    .filter((h) => h && !h.skip)
    .map((h) => {
      const own = h.file && h.file !== location?.file ? (readText(resolve(cwd, h.file)) || "").split("\n") : sourceLines;
      const out = { message: h.message };
      if (h.file) out.file = h.file;
      if (h.command) out.command = h.command;
      if (h.snippet) out.snippet = h.snippet;
      const diff = computeDiff(h, own, location);
      if (diff) out.diff = diff;
      return out;
    });
  const notes = (d.notes || []).filter(Boolean);
  if ((ctx.err?.items?.length || 0) > 1) notes.push(`${ctx.err.items.length - 1} more error(s) were reported in the same build`);
  if (ctx.routingKind) notes.push(`thrown from the route's ${tick(ctx.routingKind)} file`);
  const diagnostic = {
    severity: d.severity || "error",
    code: d.code || null,
    kind: d.kind || "runtime",
    title: d.title,
    message: d.message ?? ctx.message,
    context: opts.context || null,
    location,
    label: d.label || null,
    frame,
    notes,
    helps,
    docs: docsUrl(d.code),
    stack: cleanStack(ctx.err?.stack, cwd),
    at: Date.now(),
  };
  if (location) {
    const { absFile, ...rest } = location;
    diagnostic.location = { ...rest, abs: absFile ?? resolve(cwd, location.file) };
  }
  diagnostic.markdown = toMarkdown(diagnostic);
  return diagnostic;
}

/**
 * Turn any thrown value into a rustc-style diagnostic: code, title, primary
 * span + label, notes, and concrete `help` suggestions (with diffs when the fix
 * can be computed from the source).
 */
export function diagnose(input, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  if (input == null) {
    const d = {
      code: "SR0148",
      kind: "runtime",
      title: `a value of ${tick(String(input))} was thrown`,
      helps: [{ message: "throw an Error so you get a message and a stack trace", snippet: 'throw new Error("describe what went wrong");' }],
    };
    return finalize(d, { cwd, lines: [], message: String(input), err: null }, opts);
  }
  if (input.diagnostic) {
    const pre = input.diagnostic;
    const absFile = pre.location?.absFile || (pre.location?.file ? resolve(cwd, pre.location.file) : null);
    const source = absFile ? readText(absFile) : null;
    const location = absFile ? { absFile, line: pre.location.line || 1, column: pre.location.column || 1, length: pre.location.length || 0 } : null;
    return finalize({ ...pre, location: undefined }, { cwd, err: input, location, source, lines: source ? source.split("\n") : [], message: pre.message ?? input.message }, opts);
  }
  const err = unwrap(typeof input === "object" ? input : new Error(String(input)));
  const message = messageOf(err);
  const location = locate(err, cwd);
  const source = location?.absFile ? readText(location.absFile) : null;
  const ctx = {
    err,
    cwd,
    message,
    location,
    source,
    lines: source ? source.split("\n") : [],
    context: opts.context,
    pageFile: opts.pageFile,
    layoutFiles: opts.layoutFiles,
    errorFile: opts.errorFile,
    routingKind: err.__routingKind,
  };
  for (const rule of RULES) {
    const d = rule(ctx);
    if (d) return finalize(d, ctx, opts);
  }
  return finalize(fallback(ctx), ctx, opts);
}

// ── Builders for framework-detected problems ─────────────────────────────────

function lineIndex(file, re) {
  const src = readText(file);
  if (!src) return null;
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (m) return { line: i + 1, column: m.index + 1, length: m[0].length, text: lines[i] };
  }
  return null;
}

export function missingDefaultExportDiagnostic(file, cwd = process.cwd()) {
  const src = readText(file) || "";
  const lines = src.split("\n");
  const helps = [];
  let location = { absFile: file, line: 1, column: 1, length: 0 };
  for (let i = 0; i < lines.length; i++) {
    const exported = lines[i].match(/^(\s*)export\s+(async\s+)?function\s+([A-Z][\w$]*)/);
    if (exported) {
      location = { absFile: file, line: i + 1, column: exported[1].length + 1, length: 6 };
      helps.push({ message: `make ${tick(exported[3])} the default export`, replacement: { line: i + 1, column: exported[1].length + 1, length: 6, text: "export default" } });
      break;
    }
    const local = lines[i].match(/^(\s*)(async\s+)?function\s+([A-Z][\w$]*)/);
    if (local) {
      location = { absFile: file, line: i + 1, column: local[1].length + 1, length: 8 };
      helps.push({ message: `export ${tick(local[3])} as the default export`, replacement: { line: i + 1, column: local[1].length + 1, length: 0, text: "export default " } });
      break;
    }
  }
  if (!helps.length) {
    helps.push({ message: "add a default-exported component", insert: { line: lines.length + 1, text: "export default function Page() {\n  return <main />;\n}" } });
  }
  return {
    code: "SR0080",
    kind: "routing",
    title: `${tick(relFile(file, cwd))} has no default export`,
    label: "the router needs a default-exported component",
    location,
    notes: ["each `page.tsx` must `export default` the component that renders the route"],
    helps,
  };
}

export function serverInClientDiagnostic(pageFile, offender, cwd = process.cwd()) {
  const rel = (f) => relFile(f, cwd);
  const importSpecRe = new RegExp(`from\\s*["'][^"']*${escapeRe(basename(offender).replace(/\.[^.]+$/, ""))}["']`);
  const importLine = lineIndex(pageFile, importSpecRe);
  const directive = lineIndex(offender, /["']use server["'];?/);
  const helps = [];
  if (directive) helps.push({ message: `remove ${tick("'use server'")} — the component will render normally inside the client page`, file: rel(offender), remove: { line: directive.line } });
  helps.push({ message: "move server-only work into `loader.ts` or `action.ts` and pass the data down as props" });
  helps.push({ message: `or drop ${tick("'use client'")} from the page and mark only the interactive leaf component as ${tick("'use client'")}` });
  return {
    code: "SR0113",
    kind: "compile",
    title: `${tick(rel(offender))} declares 'use server' but is imported into the 'use client' page ${tick(rel(pageFile))}`,
    message: `Unsupported: '${rel(offender)}' declares 'use server' but is imported into the 'use client' page '${rel(pageFile)}'.`,
    location: importLine ? { absFile: pageFile, line: importLine.line, column: importLine.column, length: importLine.length } : { absFile: pageFile, line: 1, column: 1, length: 0 },
    label: "server component imported here",
    notes: ["swift-rust uses SSR + client islands, not React Server Components, so a 'use server' component inside a client tree cannot run on the server"],
    helps,
  };
}

export function useStaticConflictDiagnostic(routeFile, reasons, cwd = process.cwd()) {
  const directive = routeFile ? lineIndex(routeFile, /["']use static["'];?/) : null;
  const runtime = routeFile ? lineIndex(routeFile, /["']use (?:node|edge|bun|worker)["'];?/) : null;
  const helps = [];
  if (runtime) helps.push({ message: `remove the runtime directive so the route can stay static`, remove: { line: runtime.line } });
  if (directive) helps.push({ message: `or remove ${tick("'use static'")} if the route really needs to be dynamic`, remove: { line: directive.line } });
  helps.push({ message: "for periodic refresh, keep 'use static' and add a `revalidate.ts` (ISR)" });
  const rel = routeFile ? relFile(routeFile, cwd) : "(route)";
  return {
    code: "SR0015",
    kind: "compile",
    title: `route ${tick(rel)} is marked 'use static' but is dynamic`,
    message: `Route '${rel}' is marked 'use static' but is dynamic: it has ${reasons.join(", ")}.`,
    location: directive ? { absFile: routeFile, line: directive.line, column: directive.column, length: directive.length } : routeFile ? { absFile: routeFile, line: 1, column: 1, length: 0 } : null,
    label: "declared static here",
    notes: [...reasons.map((r) => `dynamic because of ${r}`), "a 'use static' route is prerendered and CDN-cached, so it can't use request-time features"],
    helps,
  };
}

export function staticCookieDiagnostic(routeFile, cwd = process.cwd()) {
  const directive = routeFile ? lineIndex(routeFile, /["']use static["'];?/) : null;
  return {
    code: "SR0015",
    kind: "runtime",
    title: "a 'use static' route set a cookie during render",
    message: "A 'use static' route set a cookie during render, which is a dynamic action. Remove 'use static' or stop setting cookies on this route.",
    location: directive ? { absFile: routeFile, line: directive.line, column: directive.column, length: directive.length } : null,
    label: "declared static here",
    notes: ["static routes are cached on the CDN and shared by every visitor, so per-request cookies can't be set"],
    helps: [
      directive ? { message: `remove ${tick("'use static'")} to render this route per request`, remove: { line: directive.line } } : null,
      { message: "or set the cookie from an `action.ts` or API route instead of during render" },
    ],
  };
}

export function notFoundDiagnostic(pathname, { appDir, routes = [], cwd = process.cwd() } = {}) {
  const segs = pathname.split("/").filter(Boolean);
  const target = appDir ? relFile(join(appDir, ...segs, "page.tsx"), cwd) : `app${pathname === "/" ? "" : pathname}/page.tsx`;
  const similar = closest(pathname, routes.filter((r) => r !== pathname), Math.max(2, Math.floor(pathname.length / 3)));
  const helps = [];
  if (similar) helps.push({ message: `a route with a similar path exists: ${tick(similar)}` });
  helps.push({ message: `create ${tick(target)}`, snippet: "export default function Page() {\n  return <main>…</main>;\n}" });
  return {
    code: "SR0002",
    kind: "notFound",
    title: `no route matches ${tick(pathname)}`,
    notes: [`the router looked for ${tick(target)}`],
    helps,
  };
}

export function routingFileWarning(file, appRel, cwd = process.cwd()) {
  const rel = relFile(file, cwd);
  const target = `${appRel}/${basename(file)}`;
  return {
    severity: "warning",
    code: "SR0002",
    kind: "routing",
    title: `routing file ${tick(rel)} is outside ${tick(`${appRel}/`)} and will be ignored`,
    location: { absFile: file, line: 1, column: 1, length: 0 },
    label: "the router only scans the app directory",
    helps: [{ message: `move it into ${tick(`${appRel}/`)}`, command: `mv ${rel} ${target}` }],
  };
}

export function invalidRuntimeWarning(runtime, valid) {
  const similar = closest(String(runtime), valid, 3);
  return {
    severity: "warning",
    code: "SR0073",
    kind: "config",
    title: `unknown runtime ${tick(JSON.stringify(runtime))} — falling back to ${tick("bun")}`,
    notes: [`valid runtimes are ${valid.map(tick).join(", ")}`],
    helps: [similar ? { message: `did you mean ${tick(similar)}?` } : { message: "set `runtime` to one of the valid values" }],
  };
}

export function noAppDirDiagnostic(cwd = process.cwd()) {
  return {
    code: "SR0002",
    kind: "routing",
    title: "no `app/` directory found",
    notes: [`looked in ${tick(relFile(join(cwd, "src", "app"), cwd))} and ${tick("app")}`],
    helps: [{ message: "create your first page at `src/app/page.tsx`", snippet: "export default function Page() {\n  return <h1>Hello, Swift Rust</h1>;\n}" }],
  };
}

export function serverActionNotFoundDiagnostic(exportName, file, cwd = process.cwd()) {
  const exp = readExports(readText(file) || "");
  const similar = closest(exportName, exp.named);
  return {
    code: "SR0048",
    kind: "runtime",
    title: `server action ${tick(exportName)} not found in ${tick(relFile(file, cwd))}`,
    location: { absFile: file, line: 1, column: 1, length: 0 },
    notes: exp.named.length ? [`exported actions: ${exp.named.map(tick).join(", ")}`] : ["this file has no named exports"],
    helps: [similar ? { message: `did you mean ${tick(similar)}?` } : { message: `export an async function named ${tick(exportName)} from this file` }],
  };
}

/** Build a SwiftRustError from a builder result (keeps message for logs/tests). */
export function toError(diagnosticSpec) {
  return new SwiftRustError(diagnosticSpec);
}

// ── Rendering ────────────────────────────────────────────────────────────────

function expandTabs(s) {
  return String(s ?? "").replace(/\t/g, "  ");
}

function caretPrefix(lineText, column) {
  return expandTabs(String(lineText ?? "").slice(0, Math.max(0, column - 1))).replace(/\S/g, " ");
}

/** rustc-style terminal rendering. `paint(color, text)` applies ANSI colors. */
export function renderTerminal(d, paint = (_c, s) => s) {
  const sev = d.severity === "warning" ? "yellow" : "red";
  const out = [];
  const head = `${d.severity}${d.code ? `[${d.code}]` : ""}`;
  out.push(`${paint("bold", paint(sev, head))}${paint("bold", `: ${d.title}`)}`);
  const nums = [d.location?.line || 0];
  for (const h of d.helps || []) for (const l of h.diff || []) nums.push(l.n);
  const w = String(Math.max(...nums, 1)).length;
  const pad = " ".repeat(w);
  const bar = paint("blue", "|");
  if (d.location) {
    out.push(`${pad}${paint("blue", "-->")} ${d.location.file}:${d.location.line}:${d.location.column}`);
    out.push(`${pad} ${bar}`);
    const text = expandTabs(d.location.lineText);
    out.push(`${paint("blue", String(d.location.line).padStart(w))} ${bar} ${text}`);
    const carets = "^".repeat(Math.max(1, d.location.length || 1));
    out.push(`${pad} ${bar} ${caretPrefix(d.location.lineText, d.location.column)}${paint(sev, paint("bold", carets))}${d.label ? ` ${paint(sev, paint("bold", d.label))}` : ""}`);
    out.push(`${pad} ${bar}`);
  }
  for (const note of d.notes || []) out.push(`${pad} ${paint("blue", "=")} ${paint("bold", "note")}: ${note}`);
  if (d.context) out.push(`${pad} ${paint("blue", "=")} ${paint("bold", "note")}: ${d.context}`);
  let blockStarted = false;
  for (const h of d.helps || []) {
    const command = h.command ? `: ${paint("cyan", h.command)}` : "";
    if (!h.diff && !h.snippet) {
      out.push(
        blockStarted
          ? `${paint("bold", paint("cyan", "help"))}: ${h.message}${command}`
          : `${pad} ${paint("blue", "=")} ${paint("bold", paint("cyan", "help"))}: ${h.message}${command}`,
      );
      continue;
    }
    blockStarted = true;
    out.push("");
    out.push(`${paint("bold", paint("cyan", "help"))}${paint("bold", `: ${h.message}`)}${h.file && h.file !== d.location?.file ? paint("dim", ` (in ${h.file})`) : ""}`);
    out.push(`${pad} ${bar}`);
    for (const l of h.diff || []) {
      const color = l.type === "+" ? "green" : "red";
      const [a, b] = l.mark || [0, 0];
      const text = expandTabs(l.text.slice(0, a)) + paint("bold", paint(color, expandTabs(l.text.slice(a, b)))) + expandTabs(l.text.slice(b));
      out.push(`${paint("blue", String(l.n).padStart(w))} ${paint(color, l.type)} ${text}`);
    }
    if (h.snippet) for (const line of h.snippet.split("\n")) out.push(`${pad} ${bar} ${paint("green", line)}`);
    out.push(`${pad} ${bar}`);
  }
  if (d.docs) {
    out.push("");
    out.push(paint("dim", `For more information about this ${d.severity}, see ${d.docs}`));
  }
  return out.join("\n");
}

export function toMarkdown(d) {
  const lang = /\.(tsx?|jsx?)$/.exec(d.location?.file || "")?.[1] || "tsx";
  const lines = [];
  lines.push(`## ${d.severity}${d.code ? `[${d.code}]` : ""}: ${d.title.replace(/`/g, "'")}`);
  if (d.context) lines.push(`Context: ${d.context}`);
  if (d.location) lines.push(`Location: \`${d.location.file}:${d.location.line}:${d.location.column}\``);
  if (d.frame) {
    lines.push("", "```" + lang);
    d.frame.lines.forEach((t, i) => lines.push(`${d.frame.start + i === d.location?.line ? ">" : " "} ${d.frame.start + i} | ${t}`));
    lines.push("```");
  }
  if (d.message && d.message !== d.title) lines.push("", "Original message:", "```", d.message.trim(), "```");
  for (const note of d.notes || []) lines.push(`- note: ${note}`);
  for (const h of d.helps || []) {
    lines.push(`- help: ${h.message}${h.command ? ` — \`${h.command}\`` : ""}`);
    if (h.diff) {
      lines.push("```diff");
      for (const l of h.diff) lines.push(`${l.type} ${l.text}`);
      lines.push("```");
    }
    if (h.snippet) lines.push("```" + lang, h.snippet, "```");
  }
  if (d.stack) lines.push("", "<details><summary>Stack</summary>", "", "```", d.stack.split("\n").slice(0, 12).join("\n"), "```", "</details>");
  if (d.docs) lines.push("", `Docs: ${d.docs}`);
  return lines.join("\n");
}
