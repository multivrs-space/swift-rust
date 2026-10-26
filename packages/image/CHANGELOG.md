# @swift-rust/image

## 1.1.3

### Patch Changes

- 1314a72: Point package homepage and repository metadata at swift-rust.multivrs.space and github.com/multivrs-space/swift-rust.

## 1.0.0

### Major Changes

- ece74b8: Three component-level changes:

  - **`@swift-rust/image`**: `<Image>` now requires `placeholder="blur"` and a `blurDataURL` (base64 data URL). The `"empty"` placeholder option is removed. Missing or invalid props throw `ImageMissingBlurError` (code `SR0151`) at render time. See `errors/docs/SR0151.md` for the migration guide.

  - **`@swift-rust/pdf`**: New `<Pdf>` viewer component for displaying existing PDFs in the page. Multi-page navigation, zoom, keyboard controls, error states. Depends on `pdfjs-dist@^4.7.0` (added as a runtime dependency). The existing generator (`<Document>`, `<Page>`, `<Text>`, `<View>`) is unchanged. Two new error codes: `SR0152` (load failed) and `SR0153` (render failed).

  - **`@swift-rust/video`**: New error events: `onError`, `onLoadStart`, `onCanPlay`, `onWaiting`, `onLoadedData`. The `MediaError` event is now wired to a `VideoError` with stable codes `SR0154` (media) and `SR0155` (invalid YouTube/Vimeo ID). Built-in error UI replaces the player on failure. New `errorFallback` and `loadingFallback` props for custom UI.

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
