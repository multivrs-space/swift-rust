# swift-rust

The main `swift-rust` npm package. Installing it in a project gives you:

- A `swift-rust` bin on `PATH` (or via `npx swift-rust`).
- Imports for `<Image>`, `<Font>`, `<Document>`, `<Head>`, `<Link>`, etc.
- A `defineConfig` helper for `swift-rust.config.json`.

The framework binary is downloaded at install time from GitHub Releases. If no prebuilt binary is available for the user's platform, `cargo build` is run as a fallback.

## Install

```bash
npm install swift-rust
# or
bun add swift-rust
# or
yarn add swift-rust
```

## Usage

### CLI

```bash
npx swift-rust dev      # start dev server
npx swift-rust build    # production build → dist/ (Multivrs, default)
npx swift-rust build --target vercel   # → .vercel/output (auto when VERCEL=1)
npx swift-rust start    # start production server
npx swift-rust info     # print environment
```

### In code

```tsx
import { Image, Inter, Document, Page, Text, View } from "swift-rust";

const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <Image src="/hero.jpg" width={1200} height={600} alt="Hero" priority />
      </body>
    </html>
  );
}
```

## Deployment

`swift-rust build` targets **Multivrs** by default. It writes `dist/multivrs-build.json`, a
self-contained `dist/server.mjs` (run it with `cd dist && PORT=8080 bun server.mjs`) and
`dist/static/` for the CDN. On Vercel (`VERCEL=1`), or with `--target vercel`, it writes
`.vercel/output` instead. Pin a target with `"target"` in `swift-rust.config.json`. See the
[deploying guide](https://swift-rust.multivrs.space/docs/getting-started/deploying).

## Subpath exports

| Path                    | What it exposes                                          |
| ----------------------- | -------------------------------------------------------- |
| `swift-rust`            | Everything (config, components, types).                  |
| `swift-rust/image`      | `<Image>` component + types.                             |
| `swift-rust/font`       | Font helpers + types.                                    |
| `swift-rust/font/google`| Google Fonts families.                                   |
| `swift-rust/font/local` | `localFont` for self-hosted fonts.                       |
| `swift-rust/pdf`        | `<Document>`, `<Page>`, `<Text>`, `<View>`.              |
| `swift-rust/env`        | Env loading + `SWIFT_RUST_PUBLIC_*` helpers.             |
| `swift-rust/router`     | Route handler types.                                     |
| `swift-rust/head`       | `<Head>` metadata.                                       |
| `swift-rust/link`       | `<Link>` client navigation.                              |

## Publishing

This package is built from `packages/swift-rust/` in the monorepo.

```bash
# 1. Build native binaries for all platforms
SWIFT_RUST_VERSION=0.1.0 bun run scripts/package-native.ts

# 2. Publish to npm
cd packages/swift-rust
bun publish
```

The `prepublishOnly` script runs both steps automatically.
