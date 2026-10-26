/**
 * Single source of truth for external URLs and the framework version.
 *
 * Override URLs at build time with environment variables (e.g. in the Vercel
 * dashboard or a local .env). The version is the latest `swift-rust`
 * published to npm when the site was built (SWIFT_RUST_VERSION overrides it);
 * <Version /> renders it and LiveVersionScript replaces it in the browser with
 * the current npm version, so a release shows up without a redeploy.
 */
import { createRequire } from "node:module";
import { join } from "node:path";

function workspaceSwiftRustVersion(): string {
  try {
    // Anchor the resolver to the project root (cwd) rather than import.meta.url:
    // the dev server imports modules with a cache-busting query string, which
    // makes import.meta.url an invalid base for module resolution.
    const require = createRequire(join(process.cwd(), "noop.js"));
    const v = (require("swift-rust/package.json") as { version?: string }).version;
    if (v) return v;
  } catch {
    // ignore
  }
  return "0.0.0";
}

async function publishedSwiftRustVersion(): Promise<string> {
  try {
    const res = await fetch("https://registry.npmjs.org/swift-rust/latest", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const { version } = (await res.json()) as { version?: string };
      if (version && /^\d+\.\d+\.\d+/.test(version)) return version;
    }
  } catch {
    // offline / registry down → fall back to the workspace package
  }
  return workspaceSwiftRustVersion();
}

const VERSION = process.env.SWIFT_RUST_VERSION ?? (await publishedSwiftRustVersion());

const GITHUB = process.env.SWIFT_RUST_GITHUB_URL ?? "https://github.com/multivrs-space/swift-rust";
const UI =
  process.env.SWIFT_RUST_UI_URL ??
  (process.env.VERCEL ? "https://ui.multivrs.space/" : "http://localhost:3211/");

export const siteConfig = {
  /** Marketing / main site. */
  url: process.env.SWIFT_RUST_SITE_URL ?? "https://swift-rust.multivrs.space/",
  /** Documentation site. */
  docsUrl: process.env.SWIFT_RUST_DOCS_URL ?? "https://docs.multivrs.space/",
  /** Component library site. */
  uiUrl: UI,
  /** Source repository. */
  githubUrl: GITHUB,
  /** GitHub issues. Derived from githubUrl unless explicitly overridden. */
  issuesUrl: process.env.SWIFT_RUST_ISSUES_URL ?? `${GITHUB}/issues`,
  /** Latest published swift-rust version (npm), e.g. "1.12.1". */
  version: VERSION,
  /** Release line for headings, e.g. "1.12". */
  releaseLine: VERSION.split(".").slice(0, 2).join("."),
} as const;
