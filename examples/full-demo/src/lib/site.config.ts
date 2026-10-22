/**
 * Single source of truth for external URLs and the framework version.
 *
 * Override URLs at build time with environment variables (e.g. in the Vercel
 * dashboard or a local .env). The version is read from the installed
 * `swift-rust` package, so it updates automatically on every release — no
 * hand-editing "v0.1.0" across the site.
 */
import { createRequire } from "node:module";
import { join } from "node:path";

function swiftRustVersion(): string {
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

const GITHUB = process.env.SWIFT_RUST_GITHUB_URL ?? "https://github.com/multivrs-space/swift-rust";

export const siteConfig = {
  /** Marketing / main site. */
  url: process.env.SWIFT_RUST_SITE_URL ?? "https://swift-rust-self.vercel.app",
  /** Documentation site. */
  docsUrl: process.env.SWIFT_RUST_DOCS_URL ?? "https://docs-swift-rust.vercel.app",
  /** Source repository. */
  githubUrl: GITHUB,
  /** GitHub issues. Derived from githubUrl unless explicitly overridden. */
  issuesUrl: process.env.SWIFT_RUST_ISSUES_URL ?? `${GITHUB}/issues`,
  /** Framework version, read from the installed swift-rust package. */
  version: swiftRustVersion(),
} as const;
