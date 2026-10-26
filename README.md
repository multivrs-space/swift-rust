# Swift Rust

The full-stack React framework powered with Rust + Bun. Inspired by Next.js. **10x faster than Next.js.** Write your UI in TSX, render on the server with Rust, and ship a single binary.

Site: https://swift-rust.multivrs.space/ · Source: https://github.com/multivrs-space/swift-rust

## Features

- **TSX-first** — Author components in TypeScript with first-class TSX syntax, just like TanStack Start. A custom SWC plugin transforms TSX into optimized Rust view templates.
- **Multi-target rendering** — Choose per project: full SSR, SSR + WASM hydration, server-rendered HTML with HTMX islands, or a fully client-rendered WASM SPA.
- **Built-in components** — `Image`, `Font`, and `Pdf` components handle optimization, loading, and document generation out of the box.
- **Zero-config dev server** — `swift-rust dev` starts a hot-reloading dev server with sensible defaults.
- **Single binary deployment** — Compile your entire app to one Rust binary. No Node.js required in production.
- **File-based routing** — Like Next.js: files in `app/` become routes automatically.

## Repository layout

```
swift-rust/
├── crates/        Rust workspace (framework core, compiler, server, bundler, runtime)
├── packages/      JS/TS packages (swift-rust, create-swift-rust, font, bundle-analyzer, eslint-*, env)
├── docs/          Documentation site
├── errors/        Error code reference and schemas
├── scripts/       Build, release, and CI scripts
├── test/          Integration and end-to-end tests
└── examples/      Example applications
```

## Quick start

```bash
# Scaffold a new project
bun create swift-rust@latest my-app
# or
bunx create-swift-rust@latest my-app

# Enter and start dev server
cd my-app
bun install
bun swift-rust dev
```

Open http://localhost:3000.

## Rendering modes

Swift Rust supports four rendering strategies. Pick the one that fits your project:

| Mode               | Use case                                                 |
| ------------------ | -------------------------------------------------------- |
| `ssr`              | Server-renders full HTML. Lightest. No client JS.        |
| `ssr-wasm`         | SSR first paint + WASM hydration for interactivity.      |
| `ssr-htmx`         | SSR with HTMX islands for progressive enhancement.       |
| `wasm`             | Full WASM SPA with optional SSR shell.                   |

Set the mode in `swift-rust.config.ts`:

```ts
import { defineConfig } from "swift-rust";

export default defineConfig({
  rendering: "ssr-wasm",
  components: {
    image: { domains: ["cdn.example.com"] },
    font: { subsets: ["latin"] },
  },
});
```

## Built-in components

### `<Image>`

```tsx
import { Image } from "swift-rust/image";

export default function Hero() {
  return <Image src="/hero.jpg" width={1200} height={600} priority alt="Hero" />;
}
```

### `<Font>`

```tsx
import { Inter } from "swift-rust/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className}>
      <body>{children}</body>
    </html>
  );
}
```

### `<Pdf>`

```tsx
import { Document, Page, Text, View } from "swift-rust/pdf";

export default function Invoice({ items }) {
  return (
    <Document>
      <Page size="A4">
        <View>
          <Text>Invoice</Text>
          {items.map((it) => (
            <Text key={it.id}>{it.name}: ${it.price}</Text>
          ))}
        </View>
      </Page>
    </Document>
  );
}
```

## Deployment

`swift-rust build` has two targets, so the same repo deploys to both with no config:

| Target                  | Output           | Selected when                                  |
| ----------------------- | ---------------- | ---------------------------------------------- |
| `multivrs` (default)    | `dist/`          | no flag, no config, not on Vercel              |
| `vercel`                | `.vercel/output` | `VERCEL=1` (set by Vercel builds) or `--target vercel` |

`--target <name>` wins, then `"target"` in `swift-rust.config.json`, then `VERCEL=1`.

### Multivrs (default)

```bash
bun install --frozen-lockfile
NODE_ENV=production bunx swift-rust build
cd dist && PORT=8080 bun server.mjs
```

`dist/multivrs-build.json` lists every route with its `renderMode`. Prerendered pages are
`"wasm"` and are served from `dist/static/` on the CDN. Request-time routes are `"ssr"` on
`"bun"`. They are handled by `dist/server.mjs`, one self-contained ES module with every
dependency bundled. That server also serves images at `/_swift-rust/image`.

### Vercel

Import the repo at [vercel.com/new](https://vercel.com/new). Vercel sets `VERCEL=1`, so
`bun run build` writes the Build Output API v3 (`.vercel/output`), sets
`"bunVersion"` in `vercel.json`, and routes images through `/_vercel/image`. Locally:
`bunx swift-rust build --target vercel`.

## Running the examples

```bash
cargo build --release -p swift-rust
export PATH="$PWD/target/release:$PATH"
cd examples/hello-world && bun install && swift-rust dev
```

See [PUBLISHING.md](./PUBLISHING.md) for the full release flow.

## Project status

This is pre-alpha. The scaffold is in place; the framework core is under active development.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [AGENTS.md](./AGENTS.md).

## License

MIT
