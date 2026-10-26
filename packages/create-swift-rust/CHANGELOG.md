# create-swift-rust

## 0.9.11

### Patch Changes

- 1314a72: Point package homepage and repository metadata at swift-rust.multivrs.space and github.com/multivrs-space/swift-rust.

## 0.9.10

### Patch Changes

- Generated README (non-template path) documents both deploy targets: Multivrs (default) and Vercel. The project-structure snippet is built outside the template literal, so Biome 2.4 and 2.6 format it the same way. The offline fallback `swift-rust` range is now `^1.12.1`, the first release where the template's API routes deploy.

## 0.9.9

### Patch Changes

- The generated README documents both deploy targets: Multivrs (the default, `dist/`) and Vercel (`.vercel/output`, chosen automatically on Vercel). The offline fallback `swift-rust` range is now `^1.12.0`.

## 0.3.0

### Minor Changes

- 5fc1c5b: Generate a `vercel.json` preconfigured for the Swift Rust build output (`outputDirectory: ".vercel/output"`), so new apps deploy to Vercel out of the box. Bump the generated `swift-rust` dependency from `0.1.0` to `^0.2.0`. Add a "Deploy to Vercel" section to the generated README.

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
