# Changelog

All notable changes to Swift Rust are documented in this file via [Changesets](https://github.com/changesets/changesets).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 2026-10-26

### swift-rust 1.12.0

- **Multivrs is now the default build target.** `swift-rust build` writes `dist/multivrs-build.json`, a self-contained `dist/server.mjs` and `dist/static/`. Use `--target vercel` (or let Vercel's `VERCEL=1` pick it) for the unchanged `.vercel/output`. You can pin the target with `"target"` in `swift-rust.config.json`.
- Fixed `swift-rust build` leaving its prerender dev server running after the build.

### create-swift-rust 0.9.9

- Generated README covers deploying to Multivrs (default) and Vercel.

### swift-rust 1.12.1

- API routes (`app/api/**/route.ts`), server actions (`/_swift-rust/action`) and `rpc.ts` / `stream.ts` handlers now deploy on both Multivrs and Vercel; they previously worked only in `swift-rust dev`. Only `"use server"` / `actions.ts` modules can be called as actions in production.
- Production endpoint errors return a generic 500 and are reported to `instrumentation.onRequestError`. Also fixed dev never calling `onRequestError` for API route errors.

### create-swift-rust 0.9.10

- Generated README covers Multivrs and Vercel; offline `swift-rust` fallback is `^1.12.1`.
