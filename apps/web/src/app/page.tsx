import { CopyCommand } from "@/components/copy-command";
import { NpmDownloads } from "@/components/npm-downloads";
import { posts } from "@/lib/posts";
import { siteConfig } from "@/lib/site.config";
import { Link } from "swift-rust";

const CREATE_COMMAND = "bun create swift-rust@latest";

const BENTO_SECONDARY = [
  {
    title: "Data Fetching & use cache",
    description:
      "Make your React component async and await your data directly. Combine granular \"use cache\" directives, cacheLife, cacheTag, and Partial Prerendering.",
    badge: "RSC + PPR",
    href: siteConfig.docsUrl,
    external: true,
  },
  {
    title: "CSS & Swift Rust UI",
    description:
      "First-class Tailwind CSS v4, CSS Modules, and @swift-rust/ui — 12 accessible components across 6 visual design worlds (flat, 3d, glass, neo, brutal, gradient).",
    badge: "variant × size × design",
    href: siteConfig.uiUrl,
    external: true,
  },
  {
    title: "Client & Server Rendering",
    description:
      "Flexible rendering and caching options per project or per route, including Incremental Static Regeneration (ISR) and 0.90ms median SSR latency.",
    badge: "4 Modes + ISR",
    href: "/blog/four-rendering-modes",
    external: false,
  },
  {
    title: "Server Actions & <Form>",
    description:
      "Run server code by calling a function. Skip the API boilerplate and mutate state with progressive enhancement, optimistic UI, and single-roundtrip revalidation.",
    badge: "HMAC Verified",
    href: siteConfig.docsUrl,
    external: true,
  },
  {
    title: "Route Handlers & Pipeline",
    description:
      "Build strongly-typed Web Standard API endpoints, and co-locate guard.ts, schema.ts, loader.ts, and variant.ts for structured RFC 0001 route pipelines.",
    badge: "RFC 0001",
    href: "/api/posts",
    external: false,
  },
  {
    title: "Middleware & <SafeHtml>",
    description:
      "Control incoming requests, rewrites, and headers at the edge, while eliminating XSS by construction with 256-bit CSPRNG TrustedHtml tokens.",
    badge: "Zero XSS",
    href: "/blog/the-swc-plugin",
    external: false,
  },
];

const FOUNDATION_PILLARS = [
  {
    name: "React 19",
    tag: "UI Runtime",
    href: siteConfig.docsUrl,
    description:
      "The library for web and native user interfaces. Swift Rust is built on the latest React 19 features, including Server Components, Actions, and Suspense streaming.",
    metrics: ["Server Components", "Server Actions", "Suspense Streaming"],
    icon: IconReactAtom,
  },
  {
    name: "Rust Hyper + JSC",
    tag: "HTTP & SSR Engine",
    href: "/blog/streaming-ssr-in-rust",
    description:
      "Native Rust HTTP server, zero-copy radix router, SIMD image pipeline, and embedded JavaScriptCore worker pool delivering 0.90ms p50 SSR latency.",
    metrics: ["0.90ms p50 SSR", "1,092 req/s", "~28 MB Idle RSS"],
    icon: IconRustGear,
  },
  {
    name: "SWC + Bun Bundler",
    tag: "Compiler & Binary",
    href: "/blog/the-swc-plugin",
    description:
      "Rust-based TypeScript and TSX compilation with automatic RSC boundary splitting, compile-time SR-E* diagnostics, and standalone single-binary packaging.",
    metrics: ["2.18s Cold Build", "SR-E0001 Diagnostics", "Single Binary Deploy"],
    icon: IconCompilerCube,
  },
];

const RENDER_MODES = [
  {
    mode: "ssr-wasm",
    name: "SSR + WASM Islands",
    badge: "Default",
    jsPayload: "< 3 KB navigator",
    description:
      "Server-rendered HTML streamed from Rust, paired with a lightweight WASM router and selective client hydration only where \"use client\" is declared.",
    useCase: "Full-stack SaaS, e-commerce, and interactive web products.",
  },
  {
    mode: "ssr",
    name: "Zero-JS SSR",
    badge: "0 KB Client JS",
    jsPayload: "0 KB",
    description:
      "Pure server-rendered HTML with zero client JavaScript bundles. Instant First Contentful Paint and 100/100 Core Web Vitals out of the box.",
    useCase: "Documentation sites, blogs, marketing pages, and editorial publishing.",
  },
  {
    mode: "ssr-htmx",
    name: "SSR + HTMX",
    badge: "Hypermedia",
    jsPayload: "~14 KB",
    description:
      "Server-rendered HTML enhanced with declarative partial DOM swaps and progressive form mutations without managing client state trees.",
    useCase: "CRUD back-offices, internal tools, and server-driven workflows.",
  },
  {
    mode: "wasm",
    name: "Full WASM SPA",
    badge: "Client App",
    jsPayload: "SPA Bundle",
    description:
      "Complete client-side application mode with sub-millisecond in-memory route transitions and offline-ready asset caching.",
    useCase: "Dense interactive dashboards, canvas editors, and local-first tools.",
  },
];

const BENCHMARKS = [
  {
    metric: "SSR Latency (p50, 16-conn)",
    swiftRust: "0.90 ms",
    nextJs: "17.64 ms",
    speedup: "19.6× faster",
    swiftPct: 5,
  },
  {
    metric: "Sustained SSR Throughput",
    swiftRust: "1,092 req/s",
    nextJs: "81 req/s",
    speedup: "13.4× higher",
    swiftPct: 7,
  },
  {
    metric: "Cold Production Build (12 routes)",
    swiftRust: "2.18 s",
    nextJs: "5.71 s",
    speedup: "2.6× faster",
    swiftPct: 38,
  },
  {
    metric: "Production Memory Footprint",
    swiftRust: "28 MB RSS",
    nextJs: "145 MB RSS",
    speedup: "5.1× leaner",
    swiftPct: 19,
  },
];

export default function HomePage() {
  const recentPosts = posts.slice(0, 3);

  return (
    <>
      <section className="hero-mesh relative -mt-18 overflow-hidden border-b border-border pt-18">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-20 flex justify-center overflow-hidden select-none"
        >
          <HeroWireframeMark />
        </div>

        <div className="container-page relative z-10 pt-14 pb-20 sm:pt-20 sm:pb-28">
          <div className="mx-auto max-w-4xl text-center">
            <Link
              href="/blog/introducing-swift-rust"
              className="group inline-flex items-center gap-2.5 rounded-full border border-orange-200/90 bg-surface/90 px-3.5 py-1.5 text-[0.78rem] font-medium text-fg shadow-xs backdrop-blur-sm transition-all hover:border-orange-300 hover:shadow-sm"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[0.7rem] font-semibold text-accent">
                <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
                NEW
              </span>
              <span>
                Swift Rust v{siteConfig.version} — 19.6× faster SSR &amp; Single Binary Deploy
              </span>
              <ArrowRightIcon className="h-3.5 w-3.5 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
            </Link>

            <h1 className="mt-8 text-balance font-display text-5xl font-bold tracking-tight text-fg sm:text-6xl md:text-[4.35rem] md:leading-[1.04]">
              The React Framework
              <br />
              for the <span className="text-accent">Rust</span>{" "}
              <span className="text-fg-subtle font-semibold">and</span>{" "}
              <span className="text-accent">Bun</span> Era.
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-pretty text-[1.0625rem] leading-relaxed text-fg-muted sm:text-[1.15rem]">
              Used by performance-obsessed teams to build full-stack web applications with{" "}
              <span className="font-semibold text-fg">React 19 Server Components</span>, streaming SSR
              at <span className="font-semibold text-fg">0.90ms median latency</span>, four switchable
              rendering modes, and a <span className="font-semibold text-fg">single Rust binary</span>{" "}
              at deploy.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <a href={siteConfig.docsUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-lg">
                <span>Get Started</span>
                <ArrowRightIcon className="h-4 w-4 text-accent" />
              </a>
              <Link href="/blog/introducing-swift-rust" className="btn btn-outline btn-lg">
                <span>Read the Benchmarks</span>
              </Link>
              <CopyCommand command={CREATE_COMMAND} />
            </div>
            <div className="mt-5">
              <NpmDownloads />
            </div>
          </div>

          <WorkspacePreview />
        </div>
      </section>

      <section className="py-24 sm:py-28">
        <div className="container-page">
          <div className="mx-auto max-w-3xl text-center">
            <p className="font-mono text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-accent">
              What&apos;s in Swift Rust?
            </p>
            <h2 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl md:text-[2.65rem]">
              Everything you need to build great products on the web.
            </h2>
            <p className="mt-4 text-pretty text-[1.025rem] leading-relaxed text-fg-muted">
              Full Next.js App Router familiarity paired with Rust systems engineering—zero config
              gymnastics, zero runtime bloat.
            </p>
          </div>

          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            <Link href="/images" className="bento-card group">
              <div>
                <div className="mb-6 flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-bg p-5">
                  <DiagramOptimizations />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-[1.125rem] font-semibold text-fg group-hover:text-accent">
                    Built-in Optimizations
                  </h3>
                  <ArrowRightIcon className="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                </div>
                <p className="mt-2 text-[0.9rem] leading-relaxed text-fg-muted">
                  Automatic Image, Font (2,071 Google fonts + 8 local stacks), Video, and Script
                  optimizations for instant Core Web Vitals and zero layout shift.
                </p>
              </div>
              <div className="mt-5 flex flex-wrap gap-1.5 pt-3 border-t border-border/70">
                <span className="badge font-mono">swift-rust/image</span>
                <span className="badge font-mono">swift-rust/font</span>
                <span className="badge font-mono">swift-rust/video</span>
              </div>
            </Link>

            <Link href="/blog/streaming-ssr-in-rust" className="bento-card group">
              <div>
                <div className="mb-6 flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-bg p-5">
                  <DiagramStreaming />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-[1.125rem] font-semibold text-fg group-hover:text-accent">
                    Dynamic HTML Streaming
                  </h3>
                  <ArrowRightIcon className="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                </div>
                <p className="mt-2 text-[0.9rem] leading-relaxed text-fg-muted">
                  Instantly stream UI from the Rust + JavaScriptCore runtime, integrated with the App
                  Router, nested React Suspense boundaries, and loading.tsx skeletons.
                </p>
              </div>
              <div className="mt-5 flex flex-wrap gap-1.5 pt-3 border-t border-border/70">
                <span className="badge badge-accent font-mono">0.90ms p50</span>
                <span className="badge font-mono">renderToReadableStream</span>
              </div>
            </Link>

            <a
              href={siteConfig.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="bento-card group"
            >
              <div>
                <div className="mb-6 flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-bg p-5">
                  <DiagramServerComponents />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-[1.125rem] font-semibold text-fg group-hover:text-accent">
                    React Server Components
                  </h3>
                  <ArrowRightIcon className="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                </div>
                <p className="mt-2 text-[0.9rem] leading-relaxed text-fg-muted">
                  Add rich data-driven components without sending additional client-side JavaScript.
                  Built on React 19 with selective WebAssembly island hydration.
                </p>
              </div>
              <div className="mt-5 flex flex-wrap gap-1.5 pt-3 border-t border-border/70">
                <span className="badge font-mono">React 19.2+</span>
                <span className="badge font-mono">&quot;use client&quot; islands</span>
              </div>
            </a>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {BENTO_SECONDARY.slice(0, 5).map((item) => {
              const content = (
                <>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="badge font-mono text-[0.7rem]">{item.badge}</span>
                      <ArrowRightIcon className="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                    </div>
                    <h3 className="mt-4 font-display text-[1.0625rem] font-semibold text-fg group-hover:text-accent">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-[0.875rem] leading-relaxed text-fg-muted">
                      {item.description}
                    </p>
                  </div>
                </>
              );

              return item.external ? (
                <a
                  key={item.title}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="bento-card group"
                >
                  {content}
                </a>
              ) : (
                <Link key={item.title} href={item.href} className="bento-card group">
                  {content}
                </Link>
              );
            })}

            <Link
              href="/blog/introducing-swift-rust"
              className="orange-mesh-card group relative flex flex-col justify-between overflow-hidden rounded-[18px] border border-orange-700 p-7 text-white shadow-md transition-all hover:shadow-lg"
            >
              <svg
                aria-hidden
                viewBox="0 0 240 240"
                className="pointer-events-none absolute -right-10 -bottom-10 h-52 w-52 opacity-20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
              >
                <circle cx="120" cy="120" r="45" />
                <circle cx="120" cy="120" r="75" />
                <circle cx="120" cy="120" r="105" />
                <path d="M120 0v240M0 120h240" />
              </svg>
              <div className="relative z-10">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5 font-mono text-[0.7rem] font-semibold text-white">
                  RELEASE v{siteConfig.version}
                </span>
                <h3 className="mt-4 font-display text-2xl font-bold tracking-tight text-white">
                  Swift Rust {siteConfig.releaseLine}
                </h3>
                <p className="mt-2 text-[0.875rem] leading-relaxed text-orange-50/90">
                  The power of full-stack React 19 compiled to a single Rust executable. Migrate in one
                  command with <code className="font-mono text-white">@swift-rust/codemod</code>.
                </p>
              </div>
              <div className="relative z-10 mt-6 flex items-center justify-between pt-4 border-t border-white/20">
                <span className="text-[0.8125rem] font-semibold text-white">
                  Explore the release notes
                </span>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-accent transition-transform group-hover:translate-x-0.5">
                  <ArrowRightIcon className="h-4 w-4" />
                </span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface py-24 sm:py-28">
        <div className="container-page">
          <div className="mx-auto max-w-3xl text-center">
            <p className="font-mono text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-accent">
              Systems-Grade Architecture
            </p>
            <h2 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
              Built on a foundation of fast, production-grade tooling.
            </h2>
          </div>

          <div className="relative mt-12">
            <div className="mb-8 hidden items-center justify-center lg:flex" aria-hidden>
              <FoundationCircuitBanner />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {FOUNDATION_PILLARS.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <Link
                    key={pillar.name}
                    href={pillar.href}
                    className="bento-card group bg-bg/60 hover:bg-surface"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-accent shadow-xs">
                          <Icon className="h-5 w-5" />
                        </div>
                        <span className="badge font-mono text-[0.7rem]">{pillar.tag}</span>
                      </div>
                      <div className="mt-5 flex items-center justify-between gap-2">
                        <h3 className="font-display text-xl font-bold text-fg group-hover:text-accent">
                          {pillar.name}
                        </h3>
                        <ArrowRightIcon className="h-4 w-4 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                      </div>
                      <p className="mt-2.5 text-[0.9rem] leading-relaxed text-fg-muted">
                        {pillar.description}
                      </p>
                    </div>
                    <div className="mt-6 flex flex-wrap gap-1.5 border-t border-border pt-4">
                      {pillar.metrics.map((m) => (
                        <span key={m} className="badge bg-surface font-mono text-[0.7rem]">
                          {m}
                        </span>
                      ))}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 sm:py-28">
        <div className="container-page">
          <div className="orange-mesh-card relative overflow-hidden rounded-3xl border border-orange-700 p-8 text-white shadow-lg sm:p-12 lg:p-14">
            <div className="grid gap-12 lg:grid-cols-[1.05fr_1.25fr] lg:items-center">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3 py-1 font-mono text-[0.72rem] font-semibold uppercase tracking-wider text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  Verified Apple Silicon Benchmarks
                </span>
                <h2 className="mt-5 text-balance font-display text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-[2.75rem] md:leading-[1.08]">
                  19.6× faster SSR.
                  <br />
                  Zero Node.js overhead.
                </h2>
                <p className="mt-4 max-w-xl text-pretty text-[0.975rem] leading-relaxed text-orange-50/90">
                  Measured head-to-head against Next.js 16.4 (Turbopack) across identical 12-route
                  applications under 16-connection sustained load. Native Rust HTTP routing + pre-warmed
                  JavaScriptCore workers eliminate V8 cold-start jitter.
                </p>

                <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/20 bg-black/15 p-4 backdrop-blur-xs">
                    <div className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                      19.6×
                    </div>
                    <div className="mt-1 text-[0.78rem] text-orange-100/85">
                      Faster SSR p50 (0.90ms)
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/20 bg-black/15 p-4 backdrop-blur-xs">
                    <div className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                      1,092
                    </div>
                    <div className="mt-1 text-[0.78rem] text-orange-100/85">
                      Requests / sec (vs 81)
                    </div>
                  </div>
                  <div className="col-span-2 rounded-2xl border border-white/20 bg-black/15 p-4 backdrop-blur-xs sm:col-span-1">
                    <div className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                      2.18s
                    </div>
                    <div className="mt-1 text-[0.78rem] text-orange-100/85">
                      Cold build (2.6× faster)
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/20 bg-surface p-6 text-fg shadow-lg sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
                  <div>
                    <h3 className="font-display text-[1rem] font-bold text-fg">
                      Swift Rust v{siteConfig.version} vs. Next.js 16.4
                    </h3>
                    <p className="text-[0.78rem] text-fg-subtle">
                      12 routes · Dynamic SSR + RSC + API · Lower bar is faster / leaner
                    </p>
                  </div>
                  <span className="badge badge-accent font-mono">16-conn wrk</span>
                </div>

                <div className="mt-5 space-y-5">
                  {BENCHMARKS.map((row) => (
                    <div key={row.metric}>
                      <div className="flex items-center justify-between gap-2 text-[0.8125rem]">
                        <span className="font-medium text-fg">{row.metric}</span>
                        <span className="font-mono text-[0.75rem] font-semibold text-accent">
                          {row.speedup}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center gap-3">
                          <span className="w-20 shrink-0 font-mono text-[0.72rem] font-semibold text-fg">
                            Swift Rust
                          </span>
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{ width: `${row.swiftPct}%` }}
                            />
                          </div>
                          <span className="w-20 shrink-0 text-right font-mono text-[0.75rem] font-semibold text-fg">
                            {row.swiftRust}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="w-20 shrink-0 font-mono text-[0.72rem] text-fg-subtle">
                            Next.js 16
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                            <div className="h-full w-full rounded-full bg-stone-300" />
                          </div>
                          <span className="w-20 shrink-0 text-right font-mono text-[0.75rem] text-fg-subtle">
                            {row.nextJs}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface py-24 sm:py-28">
        <div className="container-page">
          <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <p className="font-mono text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-accent">
                Adaptive Rendering Architecture
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
                Four rendering modes. One line of config.
              </h2>
              <p className="mt-3 text-pretty text-[0.975rem] leading-relaxed text-fg-muted">
                Set your default mode in <code className="font-mono text-fg">swift-rust.config.ts</code>{" "}
                or override per route with{" "}
                <code className="font-mono text-fg">export const mode = &quot;ssr&quot;</code>. Never
                ship client JavaScript to routes that don&apos;t need it.
              </p>
            </div>
            <Link href="/blog/four-rendering-modes" className="btn btn-outline">
              <span>Read the Architecture Deep Dive</span>
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {RENDER_MODES.map((r) => (
              <div key={r.mode} className="bento-card bg-bg/50">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <code className="rounded-md border border-border bg-surface px-2 py-0.5 font-mono text-[0.75rem] font-semibold text-accent">
                      {r.mode}
                    </code>
                    <span className="badge badge-accent">{r.badge}</span>
                  </div>
                  <h3 className="mt-4 font-display text-[1.0625rem] font-bold text-fg">{r.name}</h3>
                  <p className="mt-2 text-[0.85rem] leading-relaxed text-fg-muted">
                    {r.description}
                  </p>
                </div>
                <div className="mt-6 border-t border-border pt-4">
                  <div className="flex items-center justify-between text-[0.75rem]">
                    <span className="text-fg-subtle">Client Runtime</span>
                    <span className="font-mono font-semibold text-fg">{r.jsPayload}</span>
                  </div>
                  <p className="mt-2 text-[0.75rem] leading-snug text-fg-subtle">
                    <strong className="font-medium text-fg-muted">Best for:</strong> {r.useCase}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 sm:py-28">
        <div className="container-page">
          <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr]">
            <div className="bento-card justify-between bg-surface p-8 sm:p-10">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="badge badge-accent font-mono">@swift-rust/ui</span>
                  <span className="font-mono text-[0.75rem] text-fg-subtle">
                    12 Primitives × 6 Design Worlds
                  </span>
                </div>
                <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
                  Components with a third dimension.
                </h2>
                <p className="mt-3 max-w-xl text-[0.95rem] leading-relaxed text-fg-muted">
                  Every component libraries gives you <code className="font-mono text-fg">variant</code>{" "}
                  and <code className="font-mono text-fg">size</code>. Swift Rust UI adds{" "}
                  <code className="font-mono text-accent">design</code>—letting you switch between six
                  complete visual languages without changing a single JSX prop tree.
                </p>

                <div className="pill-cluster mt-6">
                  {[
                    { id: "flat", desc: "Editorial precision" },
                    { id: "3d", desc: "Tactile depth" },
                    { id: "glass", desc: "Frosted translucency" },
                    { id: "neo", desc: "Soft surface relief" },
                    { id: "brutal", desc: "Hard offset ink" },
                    { id: "gradient", desc: "Luminous mesh" },
                  ].map((d) => (
                    <span
                      key={d.id}
                      className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-1.5 text-[0.8rem]"
                    >
                      <code className="font-mono font-semibold text-accent">{d.id}</code>
                      <span className="text-fg-subtle">· {d.desc}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
                <code className="rounded-full border border-border bg-bg px-3.5 py-1.5 font-mono text-[0.78rem] text-fg">
                  $ bunx @swift-rust/ui add button card dialog
                </code>
                <a
                  href={siteConfig.uiUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-accent"
                >
                  <span>Explore Swift Rust UI</span>
                  <ArrowRightIcon className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div className="grid gap-4">
              <Link href="/fonts" className="bento-card group p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="badge font-mono">Live Showcase · /fonts</span>
                    <h3 className="mt-3 font-display text-lg font-bold text-fg group-hover:text-accent">
                      2,071 Google Fonts + 8 Local Stacks
                    </h3>
                    <p className="mt-1 text-[0.85rem] text-fg-muted">
                      Inspect live font specimens rendered with zero FOUT and automatic CSS variable
                      injection.
                    </p>
                  </div>
                  <ArrowRightIcon className="mt-1 h-4 w-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                </div>
              </Link>

              <Link href="/images" className="bento-card group p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="badge font-mono">Live Showcase · /images</span>
                    <h3 className="mt-3 font-display text-lg font-bold text-fg group-hover:text-accent">
                      Rust Image Pipeline &amp; Blur Placeholders
                    </h3>
                    <p className="mt-1 text-[0.85rem] text-fg-muted">
                      On-demand AVIF/WebP transcoding, responsive srcsets, and zero-CLS blurDataURL
                      previews.
                    </p>
                  </div>
                  <ArrowRightIcon className="mt-1 h-4 w-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                </div>
              </Link>

              <Link href="/videos" className="bento-card group p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="badge font-mono">Live Showcase · /videos</span>
                    <h3 className="mt-3 font-display text-lg font-bold text-fg group-hover:text-accent">
                      Streaming Video &amp; Client Islands
                    </h3>
                    <p className="mt-1 text-[0.85rem] text-fg-muted">
                      Aspect-ratio locked video players, poster preloading, and interactive client
                      island controls.
                    </p>
                  </div>
                  <ArrowRightIcon className="mt-1 h-4 w-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                </div>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-surface py-24 sm:py-28">
        <div className="container-page">
          <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.5fr]">
            <div className="lg:sticky lg:top-24">
              <p className="font-mono text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-accent">
                Engineering Journal
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
                From the blog.
              </h2>
              <p className="mt-4 text-[0.95rem] leading-relaxed text-fg-muted">
                Deep dives into our Rust Hyper server, JavaScriptCore worker pool, SWC compiler pass,
                and real-world benchmark methodology.
              </p>
              <Link
                href="/blog"
                className="mt-6 inline-flex items-center gap-2 text-[0.875rem] font-semibold text-accent hover:text-accent-hover"
              >
                <span>Read all engineering posts</span>
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="grid gap-4">
              {recentPosts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="bento-card group bg-bg/40 p-6 hover:bg-surface"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[0.75rem] text-fg-subtle">
                        <time dateTime={post.date} className="font-mono">
                          {post.date}
                        </time>
                        <span>·</span>
                        <span>{post.readingTime}</span>
                        <span>·</span>
                        <span className="font-medium text-fg-muted">{post.author.name}</span>
                      </div>
                      <h3 className="mt-2.5 font-display text-[1.125rem] font-bold text-fg group-hover:text-accent">
                        {post.title}
                      </h3>
                      <p className="mt-1.5 text-[0.875rem] leading-relaxed text-fg-muted">
                        {post.excerpt}
                      </p>
                    </div>
                    <ArrowRightIcon className="mt-1 h-4 w-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="pt-16 pb-4">
        <div className="container-page">
          <div className="relative overflow-hidden rounded-[2rem] border border-stone-800 bg-[#09090b] px-6 py-20 text-center text-surface shadow-lg sm:px-14 sm:py-24">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 65% 55% at 50% -10%, rgb(255 255 255 / 0.22), rgb(234 88 12 / 0.12) 45%, transparent 75%)",
              }}
            />
            <div className="relative z-10 mx-auto max-w-xl">
              <h2 className="text-balance font-display text-3xl font-bold tracking-tight text-white sm:text-5xl">
                Ready to build at Rust speed?
              </h2>
              <p className="mx-auto mt-4 max-w-md text-pretty text-[0.95rem] leading-relaxed text-stone-400">
                Join engineering teams shipping full-stack React 19 applications as a single
                self-contained binary in seconds.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <a
                  href={siteConfig.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center justify-center rounded-full bg-white px-6 text-[0.875rem] font-semibold text-[#09090b] shadow-sm transition-transform hover:scale-[1.02] hover:bg-stone-100"
                >
                  Start for free
                </a>
                <CopyCommand command={CREATE_COMMAND} tone="dark" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function WorkspacePreview() {
  return (
    <div className="mx-auto mt-14 max-w-5xl">
      <div className="card-elevated overflow-hidden bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-2 rounded-md border border-border bg-surface px-2.5 py-0.5 font-mono text-[0.72rem] font-medium text-fg">
              src/app/page.tsx
            </span>
            <span className="hidden rounded-md px-2 py-0.5 font-mono text-[0.72rem] text-fg-subtle sm:inline-block">
              swift-rust.config.ts
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge badge-success font-mono text-[0.7rem]">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              SSR p50: 0.90ms
            </span>
            <span className="badge badge-accent font-mono text-[0.7rem]">19.6× vs Next.js</span>
          </div>
        </div>

        <div className="grid divide-y divide-border lg:grid-cols-[1.35fr_1fr] lg:divide-x lg:divide-y-0">
          <div className="min-w-0 p-5 sm:p-6">
            <pre className="overflow-x-auto font-mono text-[0.78rem] leading-[1.7] text-fg">
              <code>
                <span className="text-fg-subtle">
                  {'import { cacheLife, cacheTag } from "swift-rust/cache";'}
                </span>
                {"\n"}
                <span className="text-fg-subtle">
                  {'import { SafeHtml, sanitizeHtml } from "swift-rust/security";'}
                </span>
                {"\n"}
                <span className="text-fg-subtle">{'import Image from "swift-rust/image";'}</span>
                {"\n\n"}
                <span className="text-[#7c3aed]">export default async function</span>{" "}
                <span className="text-[#0284c7]">ProductPage</span>
                <span>() {`{`}</span>
                {"\n  "}
                <span className="text-[#ea580c]">&quot;use cache&quot;</span>;{"\n  "}
                <span className="text-[#0284c7]">cacheLife</span>(
                <span className="text-[#16a34a]">&quot;hours&quot;</span>);
                {"\n  "}
                <span className="text-[#0284c7]">cacheTag</span>(
                <span className="text-[#16a34a]">&quot;catalog&quot;</span>);
                {"\n\n  "}
                <span className="text-[#7c3aed]">const</span> metrics ={" "}
                <span className="text-[#7c3aed]">await</span>{" "}
                <span className="text-[#0284c7]">loadTelemetry</span>();
                {"\n  "}
                <span className="text-[#7c3aed]">return</span> ({"\n    <"}
                <span className="text-[#dc2626]">section</span>{" "}
                <span className="text-[#0284c7]">className</span>=
                <span className="text-[#16a34a]">&quot;grid gap-6&quot;</span>
                {">\n      <"}
                <span className="text-[#dc2626]">Image</span>{" "}
                <span className="text-[#0284c7]">src</span>=
                <span className="text-[#16a34a]">&quot;/hero.avif&quot;</span>{" "}
                <span className="text-[#0284c7]">width</span>={`{1200}`}{" "}
                <span className="text-[#0284c7]">height</span>={`{630}`}
                {" />\n      <"}
                <span className="text-[#dc2626]">SafeHtml</span>{" "}
                <span className="text-[#0284c7]">html</span>=
                {`{sanitizeHtml(metrics.summary)}`}
                {" />\n    </"}
                <span className="text-[#dc2626]">section</span>
                {">\n  );\n}"}
              </code>
            </pre>
          </div>

          <div className="flex flex-col justify-between bg-bg/50 p-5 sm:p-6">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[0.7rem] font-semibold uppercase tracking-wider text-fg-subtle">
                  Rust Hyper + JSC Telemetry
                </span>
                <span className="font-mono text-[0.7rem] text-accent">LIVE PIPELINE</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-surface p-3.5 shadow-xs">
                  <div className="text-[0.72rem] text-fg-subtle">Median SSR (p50)</div>
                  <div className="mt-1 font-display text-2xl font-bold text-fg">0.90ms</div>
                  <div className="mt-0.5 font-mono text-[0.68rem] text-success">
                    ▲ 19.6× vs Next.js 16.4
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-surface p-3.5 shadow-xs">
                  <div className="text-[0.72rem] text-fg-subtle">Throughput</div>
                  <div className="mt-1 font-display text-2xl font-bold text-fg">1,092/s</div>
                  <div className="mt-0.5 font-mono text-[0.68rem] text-accent">
                    16 concurrent workers
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-border bg-surface p-3.5 font-mono text-[0.72rem] leading-relaxed shadow-xs">
                <div className="flex items-center justify-between text-fg-subtle">
                  <span>$ swift-rust build --binary</span>
                  <span className="text-success">2.18s</span>
                </div>
                <div className="mt-1.5 text-fg-muted">
                  ✓ 12 routes compiled · 0 client KB on static routes
                </div>
                <div className="text-fg-muted">
                  ✓ Standalone binary emitted: <span className="text-fg">./dist/server (28 MB)</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[0.75rem] text-fg-subtle">
              <span>Mode: ssr-wasm</span>
              <span className="font-mono text-fg">React 19.2 · Bun 1.3 · Rust 1.85</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroWireframeMark() {
  return (
    <svg
      viewBox="0 0 1200 220"
      className="w-full max-w-6xl opacity-45"
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="wireGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d6d3d1" stopOpacity="0.35" />
          <stop offset="50%" stopColor="#ea580c" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#d6d3d1" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <g stroke="url(#wireGrad)" strokeWidth="1">
        <line x1="0" y1="40" x2="1200" y2="40" strokeDasharray="4 4" />
        <line x1="0" y1="180" x2="1200" y2="180" strokeDasharray="4 4" />
        <line x1="180" y1="0" x2="180" y2="220" strokeDasharray="4 4" />
        <line x1="1020" y1="0" x2="1020" y2="220" strokeDasharray="4 4" />
      </g>
      <text
        x="50%"
        y="152"
        textAnchor="middle"
        fill="none"
        stroke="url(#wireGrad)"
        strokeWidth="1.5"
        fontFamily="var(--font-display), sans-serif"
        fontSize="148"
        fontWeight="800"
        letterSpacing="10"
      >
        SWIFT·RUST
      </text>
    </svg>
  );
}

function DiagramOptimizations() {
  return (
    <svg viewBox="0 0 320 170" className="h-full w-full" fill="none" aria-hidden>
      <rect x="14" y="18" width="136" height="134" rx="12" fill="#ffffff" stroke="#e7e5e4" />
      <rect x="26" y="30" width="112" height="68" rx="8" fill="#fff7ed" stroke="#fed7aa" />
      <circle cx="52" cy="54" r="9" fill="#fb923c" />
      <path
        d="M34 90l26-24 22 18 18-14 28 20"
        stroke="#ea580c"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x="26" y="118" fill="#09090b" fontSize="10" fontFamily="monospace" fontWeight="600">
        &lt;Image /&gt; AVIF
      </text>
      <text x="26" y="134" fill="#16a34a" fontSize="9" fontFamily="monospace">
        CLS: 0.00 · -74% KB
      </text>

      <rect x="168" y="18" width="138" height="62" rx="12" fill="#ffffff" stroke="#e7e5e4" />
      <text x="182" y="48" fill="#09090b" fontSize="20" fontWeight="700">
        Aa
      </text>
      <text x="218" y="42" fill="#09090b" fontSize="10" fontFamily="monospace" fontWeight="600">
        2,071 Fonts
      </text>
      <text x="218" y="58" fill="#78716c" fontSize="9" fontFamily="monospace">
        Zero-FOUT CSS
      </text>

      <rect x="168" y="90" width="138" height="62" rx="12" fill="#ffffff" stroke="#e7e5e4" />
      <circle cx="196" cy="121" r="14" fill="#fff7ed" stroke="#fdba74" />
      <polygon points="193,115 204,121 193,127" fill="#ea580c" />
      <text x="220" y="117" fill="#09090b" fontSize="10" fontFamily="monospace" fontWeight="600">
        &lt;Video /&gt;
      </text>
      <text x="220" y="132" fill="#78716c" fontSize="9" fontFamily="monospace">
        Range Stream
      </text>
    </svg>
  );
}

function DiagramStreaming() {
  return (
    <svg viewBox="0 0 320 170" className="h-full w-full" fill="none" aria-hidden>
      <rect x="16" y="20" width="288" height="130" rx="12" fill="#ffffff" stroke="#e7e5e4" />
      <rect x="28" y="34" width="264" height="20" rx="5" fill="#f5f5f4" />
      <circle cx="40" cy="44" r="3.5" fill="#ea580c" />
      <text x="52" y="47" fill="#57534e" fontSize="9" fontFamily="monospace">
        HTTP/2 Chunked Stream · TTFB 0.90ms
      </text>

      <rect x="28" y="64" width="78" height="72" rx="7" fill="#f5f5f4" stroke="#e7e5e4" />
      <rect x="36" y="74" width="52" height="7" rx="3" fill="#d6d3d1" />
      <rect x="36" y="87" width="60" height="7" rx="3" fill="#e7e5e4" />
      <rect x="36" y="100" width="44" height="7" rx="3" fill="#e7e5e4" />

      <rect
        x="116"
        y="64"
        width="176"
        height="32"
        rx="7"
        fill="#fff7ed"
        stroke="#fdba74"
        strokeDasharray="3 2"
      />
      <text x="128" y="83" fill="#ea580c" fontSize="9.5" fontFamily="monospace" fontWeight="600">
        &lt;Suspense&gt; chunk flushed →
      </text>

      <rect x="116" y="104" width="84" height="32" rx="7" fill="#f0fdf4" stroke="#bbf7d0" />
      <text x="128" y="123" fill="#15803d" fontSize="9" fontFamily="monospace" fontWeight="600">
        RSC Ready ✓
      </text>

      <rect x="208" y="104" width="84" height="32" rx="7" fill="#fff7ed" stroke="#fed7aa" />
      <text x="220" y="123" fill="#ea580c" fontSize="9" fontFamily="monospace" fontWeight="600">
        Island 2.4KB
      </text>
    </svg>
  );
}

function DiagramServerComponents() {
  return (
    <svg viewBox="0 0 320 170" className="h-full w-full" fill="none" aria-hidden>
      <line x1="160" y1="44" x2="92" y2="96" stroke="#d6d3d1" strokeWidth="1.75" />
      <line x1="160" y1="44" x2="228" y2="96" stroke="#ea580c" strokeWidth="1.75" />
      <line x1="92" y1="96" x2="60" y2="140" stroke="#d6d3d1" strokeWidth="1.5" />
      <line x1="92" y1="96" x2="124" y2="140" stroke="#d6d3d1" strokeWidth="1.5" />

      <rect x="106" y="18" width="108" height="32" rx="9" fill="#09090b" />
      <text x="160" y="38" textAnchor="middle" fill="#ffffff" fontSize="10" fontFamily="monospace">
        RootLayout (RSC)
      </text>

      <rect x="40" y="80" width="104" height="32" rx="9" fill="#ffffff" stroke="#d6d3d1" />
      <text x="92" y="100" textAnchor="middle" fill="#09090b" fontSize="9.5" fontFamily="monospace">
        Server Tree · 0 KB
      </text>

      <rect x="176" y="80" width="108" height="32" rx="9" fill="#fff7ed" stroke="#ea580c" />
      <text
        x="230"
        y="100"
        textAnchor="middle"
        fill="#ea580c"
        fontSize="9.5"
        fontFamily="monospace"
        fontWeight="600"
      >
        &quot;use client&quot;
      </text>

      <circle cx="60" cy="140" r="12" fill="#ffffff" stroke="#d6d3d1" />
      <text x="60" y="143" textAnchor="middle" fill="#57534e" fontSize="8" fontFamily="monospace">
        DB
      </text>
      <circle cx="124" cy="140" r="12" fill="#ffffff" stroke="#d6d3d1" />
      <text x="124" y="143" textAnchor="middle" fill="#57534e" fontSize="8" fontFamily="monospace">
        MDX
      </text>
    </svg>
  );
}

function FoundationCircuitBanner() {
  return (
    <svg viewBox="0 0 900 72" className="w-full max-w-4xl" fill="none" aria-hidden>
      <path d="M40 36 H350 M550 36 H860" stroke="#e7e5e4" strokeWidth="1.5" />
      <path d="M140 16 H310 L350 36 M760 16 H590 L550 36" stroke="#fed7aa" strokeWidth="1.5" />
      <path d="M140 56 H310 L350 36 M760 56 H590 L550 36" stroke="#e7e5e4" strokeWidth="1.5" />
      <rect
        x="350"
        y="12"
        width="200"
        height="48"
        rx="24"
        fill="#ffffff"
        stroke="#d6d3d1"
        strokeWidth="1.5"
      />
      <g transform="translate(366, 20) scale(1)">
        <rect width="32" height="32" rx="7" fill="#0a0a0a" />
        <g stroke="#ffffff" strokeWidth="1.9" strokeLinecap="round" fill="none">
          <circle cx="16" cy="16" r="6.4" />
          <path d="M16 4.4v2.6M16 25v2.6M4.4 16h2.6M25 16h2.6M7.9 7.9l1.8 1.8M22.3 22.3l1.8 1.8M7.9 24.1l1.8-1.8M22.3 9.7l1.8-1.8" />
        </g>
        <path d="M17.8 9.3 L11.6 17 H15.2 L14.2 22.8 L20.4 15 H16.8 Z" fill="#fb923c" />
      </g>
      <text
        x="466"
        y="40"
        textAnchor="middle"
        fill="#09090b"
        fontSize="13"
        fontFamily="var(--font-mono), monospace"
        fontWeight="700"
        letterSpacing="1.5"
      >
        SWIFT·RUST
      </text>
    </svg>
  );
}

function ArrowRightIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconReactAtom({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden>
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      <ellipse cx="12" cy="12" rx="10" ry="4.2" />
      <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(120 12 12)" />
    </svg>
  );
}

function IconRustGear({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden>
      <circle cx="12" cy="12" r="3.5" />
      <path
        d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCompilerCube({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden>
      <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" strokeLinejoin="round" />
      <path d="M3 7l9 5 9-5M12 12v10" strokeLinejoin="round" />
    </svg>
  );
}
