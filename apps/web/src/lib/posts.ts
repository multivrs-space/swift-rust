export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readingTime: string;
  author: { name: string; role: string };
  tags: string[];
  body: string;
  cover?: string;
};

export const posts: Post[] = [
  {
    slug: "introducing-swift-rust",
    title: "Introducing Swift Rust: 19.6x Faster React SSR on a Rust + JSC Runtime",
    cover: "/blog/introducing-swift-rust.svg",
    excerpt:
      "A full-stack React 19 framework powered with Rust + Bun. 0.90ms median SSR latency, 1,092 req/s throughput, four rendering modes, and single-binary deployment.",
    date: "2026-05-28",
    readingTime: "5 min read",
    author: { name: "The Swift Rust Team", role: "Core Engineering" },
    tags: ["announcement", "framework", "benchmarks"],
    body: `Today we are open-sourcing Swift Rust, a full-stack React 19 framework that pairs the App Router developer experience you already know with a native Rust HTTP server and an embedded JavaScriptCore worker pool.

The pitch is simple: write standard TypeScript and TSX, use React 19 Server Components, Server Actions, and Suspense streaming, and deploy as a single self-contained Rust binary. In head-to-head benchmarks against Next.js 16.4 (Turbopack) across identical 12-route applications on Apple Silicon, Swift Rust delivers 0.90ms median SSR latency compared to 17.64ms in Next.js (19.6x faster), 1,092 requests/sec throughput (13.4x higher), and 2.18s cold production builds (2.6x faster).

We built Swift Rust because modern web teams shouldn't have to choose between React's component ecosystem and systems-grade runtime predictability. Every route, Built-in Optimization (<Image>, <Font>, <Video>, <Script>), and RFC 0001 pipeline primitive (guard.ts, schema.ts, loader.ts, variant.ts) is available today.`,
  },
  {
    slug: "four-rendering-modes",
    title: "Why We Shipped Four Rendering Modes in One Config Line",
    excerpt:
      "SSR + WASM, Zero-JS SSR, SSR + HTMX, and Full WASM SPA. Pick the right architecture per project or per route without rewriting components.",
    date: "2026-05-20",
    readingTime: "7 min read",
    author: { name: "Alex Chen", role: "Founding Engineer" },
    tags: ["architecture", "ssr", "wasm"],
    body: `Most React frameworks force every route through a single hydration model, shipping 90KB+ of client runtime even for pages that only toggle a menu or submit a form. We designed Swift Rust around four explicit, composable rendering modes that you can set globally in swift-rust.config.ts or override per route via export const mode:

- ssr-wasm (Default): Server-rendered HTML streamed from Rust, paired with a sub-3KB WebAssembly navigator and selective hydration for interactive "use client" islands.
- ssr (Zero-JS): Pure server-rendered HTML with 0 KB of client JavaScript. Ideal for documentation, marketing pages, and content-heavy routes.
- ssr-htmx: Server-rendered HTML enhanced with declarative partial swaps and progressive form mutations (~14 KB runtime).
- wasm (Full SPA): Complete client-side application mode with instant sub-millisecond transitions for dense interactive dashboards and canvas tools.

Because all four modes share the same App Router conventions, layouts, and TypeScript types, switching modes takes a single line of configuration—never a rewrite.`,
  },
  {
    slug: "streaming-ssr-in-rust",
    title: "Streaming SSR in Rust at 0.90ms p50 Latency",
    excerpt:
      "How we combined Hyper, an embedded JavaScriptCore worker pool, and React 19 renderToReadableStream for sub-millisecond median latency.",
    date: "2026-05-12",
    readingTime: "9 min read",
    author: { name: "Priya Singh", role: "Runtime Engineer" },
    tags: ["ssr", "rust", "internals"],
    body: `Streaming Server-Side Rendering sounds straightforward on paper until you hit real production workloads: concurrent async Server Components, nested Suspense boundaries flushing out of order, and per-request isolation under heavy load.

In Swift Rust, incoming HTTP requests are terminated by a native Rust Hyper server and routed through a zero-copy radix tree before reaching our pre-warmed JavaScriptCore worker pool. That architecture gives us three critical advantages:

1. Immediate TTFB: The static shell flushes within hundreds of microseconds while async Server Components resolve in parallel.
2. Zero V8 Cold-Start Tax: Warm JSC contexts execute pre-bundled server trees in 0.90ms at p50 and 1.71ms at p95 under 16-connection concurrency.
3. Compile-Time Diagnostics: Our SWC compiler pass emits structured diagnostic codes (SR-E0001 through SR-E1404) with clear remediation hints before a broken boundary ever reaches production.`,
  },
  {
    slug: "fonts-without-fout",
    title: "Fonts Without the FOUT: 2,071 Google Fonts at Zero Layout Shift",
    excerpt:
      "How swift-rust/font/google pre-computes font metrics, subsets glyphs, and eliminates Cumulative Layout Shift automatically.",
    date: "2026-05-04",
    readingTime: "4 min read",
    author: { name: "Maria Lopez", role: "Design Systems" },
    tags: ["fonts", "performance"],
    body: `Web fonts are the single largest contributor to unexpected Cumulative Layout Shift (CLS) on modern web pages. When a remote font loads late, metric differences between the system fallback and the web font cause text blocks to reflow.

Swift Rust's font system (swift-rust/font/google and swift-rust/font/local) solves this at build time. Every font import generates scoped class names and CSS custom properties with metric-matched fallback descriptors.

Out of the box, we ship typed definitions for all 2,071 Google Fonts—including Geist, Geist Mono, Plus Jakarta Sans, Space Grotesk, Instrument Serif, and JetBrains Mono—plus 8 curated zero-network local font stacks.`,
  },
  {
    slug: "the-swc-plugin",
    title: "Inside the SWC Compiler Pass & Capabilities-Based Security",
    excerpt:
      "How our Rust compiler pipeline strips directives, wires Server Actions, and enforces CSPRNG 256-bit SafeHtml tokens.",
    date: "2026-04-26",
    readingTime: "11 min read",
    author: { name: "Jordan Kim", role: "Compiler Engineer" },
    tags: ["compiler", "swc", "performance"],
    body: `The compiler pipeline in Swift Rust does far more than transpile TypeScript. Built on SWC in Rust alongside Bun's ultra-fast bundler, our build pipeline processes a full 12-route application in 2.18 seconds cold and 140 milliseconds warm.

During compilation, the pipeline performs three essential transformations:

1. RSC & Island Boundary Graph: Automatically splits "use client" islands and "use server" action modules into verifiable manifest graphs with HMAC-SHA256 action signatures.
2. Capabilities-Based <SafeHtml>: Replaces raw innerHTML footguns with sanitizeHtml() and mintTrustedHtml(), backed by a per-process 256-bit CSPRNG secret that client bundles can never forge.
3. Structured Error Catalog: Emits deterministic error codes (SR-E0001–SR-E1404) linked directly to actionable fixes.`,
  },
  {
    slug: "single-binary-deploy",
    title: "Deploy One Rust Binary, Scale Forever",
    excerpt:
      "Why compiling your full-stack React application into a standalone executable changes everything about infrastructure.",
    date: "2026-04-18",
    readingTime: "5 min read",
    author: { name: "Sam Rivera", role: "Infrastructure" },
    tags: ["deployment", "infrastructure"],
    body: `When you run swift-rust build --binary, the output is a single self-contained native executable containing the Rust Hyper HTTP server, your pre-rendered static assets, optimized route bundles, and the ISR cache engine.

Deploying a single binary transforms production operations:

1. Microsecond Cold Starts: Process startup takes ~4ms with a ~28MB idle RSS footprint—roughly 5x leaner than a standard Node.js server container.
2. Zero Runtime Drift: No node_modules directory in production, no missing native shared libraries, and no lockfile mismatches at deploy time.
3. Built-in Observability & Cache Control: Native /_swift-rust/revalidate endpoints with HMAC-SHA256 verification and OpenTelemetry-ready request tracing out of the box.`,
  },
];

export function getPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}

export function getPostsByTag(tag: string): Post[] {
  return posts.filter((p) => p.tags.includes(tag));
}

export function getAllTags(): string[] {
  return Array.from(new Set(posts.flatMap((p) => p.tags))).sort();
}
