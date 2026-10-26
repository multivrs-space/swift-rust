# swift-rust

## 1.12.1

### Patch Changes

- **API routes now deploy.** `swift-rust build` bundles every `app/api/**/route.ts` for both targets. Previously they worked in dev but returned 404 in production, including the six routes in the `create-swift-rust` template. On Multivrs they run in `dist/server.mjs` and are listed in `multivrs-build.json`, along with an `/api(?:/.*)?` catch-all that returns dev's JSON 404. On Vercel they run in one `/_swift-rust/endpoints` function. Matching precedence, the handler context (`{ request, params, query, body, searchParams }`), JSON/text responses, 405 + `Allow`, and the JSON 404 all match `swift-rust dev`, which now uses the same code.
- **Server actions now deploy.** `POST /_swift-rust/action` is served in production on both targets. Only modules with `"use server"` (or named `actions.ts` / `action.ts`) are bundled and callable; any other `path#export` id gets a 404. `<Form action={fn}>` on server-rendered pages now carries its action id.
- **`rpc.ts` and `stream.ts` handlers now deploy** on both targets. Pages whose folder has an `rpc.ts` are no longer prerendered, because `GET` on that path returns the procedure list, as in dev.
- In production, API route, action and rpc errors return a generic 500 instead of the error message; the real error is logged and passed to `instrumentation.onRequestError`. Built server routes now call `onRequestError` for these endpoints.
- Fixed `swift-rust dev` never calling `instrumentation.onRequestError` for API route errors. It referenced an undefined variable, and the resulting error was swallowed.

## 1.12.0

### Minor Changes

- `swift-rust build` now supports build targets. **Multivrs is the new default target.**
  - `--target multivrs` (default) writes `dist/multivrs-build.json`, a self-contained `dist/server.mjs` (all dependencies bundled; start it with `bun server.mjs`, listening on `0.0.0.0:$PORT`) and `dist/static/` for the CDN. Prerendered pages are `"wasm"` routes. Request-time routes are `"ssr"` on `"bun"`. Images are served by the server at `/_swift-rust/image`. Runtime env vars are read from `process.env` at request time, with `.env.production` values as defaults.
  - `--target vercel` keeps the existing `.vercel/output` (Build Output API v3) output unchanged, including `vercel.json` `"bunVersion"` and `/_vercel/image` rewrites.
  - With no flag, the build uses `"target"` from `swift-rust.config.json`, then `vercel` when `VERCEL=1` is set (as on Vercel builds), otherwise `multivrs`. Existing Vercel deployments keep working with no changes.

### Patch Changes

- `swift-rust build` no longer leaves its prerender dev server running after it finishes. The orphaned process kept stdout/stderr open, which could hang CI pipelines that capture build output.

## 1.0.0

### Major Changes

- swift-rust

## 0.2.1

### Patch Changes

- 15da4e2: Add `swift-rust build` command (Vercel Build Output API v3 adapter). Emits `.vercel/output/` with `config.json` + static HTML for Vercel deployment. Works with `bun run build` in the docs site.

## 0.2.0

### Minor Changes

- 03d231c: Initial public release of the swift-rust monorepo.

  13 packages publishing together at v0.1.0:

  - `swift-rust` — the core framework (TSX-first, Rust rendering, single-binary deploy)
  - `create-swift-rust` — `bun create swift-rust` scaffolder
  - `@swift-rust/image` — drop-in `<Image>` component
  - `@swift-rust/font` — `<Font>` with Google + local fonts
  - `@swift-rust/pdf` — `<Pdf>` viewer + low-level PDF primitives
  - `@swift-rust/video` — `<Video>` with HTML5, YouTube, Vimeo, lightbox modes
  - `@swift-rust/ui` — shadcn-style component registry
  - `@swift-rust/env` — validated `.env` loader
  - `@swift-rust/mdx` — MDX support
  - `@swift-rust/codemod` — automated refactors
  - `@swift-rust/bundle-analyzer` — bundle size visualization
  - `@swift-rust/eslint-config` — shared lint config
  - `@swift-rust/eslint-plugin` — framework-specific ESLint rules

### Patch Changes

- Updated dependencies [ece74b8]
- Updated dependencies [03d231c]
  - @swift-rust/image@1.0.0
  - @swift-rust/pdf@0.2.0
  - @swift-rust/video@0.2.0
  - @swift-rust/env@0.2.0
  - @swift-rust/font@0.2.0
