import { siteConfig } from "@/lib/site.config";
import type { Metadata } from "swift-rust";
import { Link } from "swift-rust";

export const metadata: Metadata = {
  title: "About",
  description:
    "How Swift Rust combines the React 19 App Router developer experience with a native Rust HTTP server and JavaScriptCore runtime.",
};

const PRINCIPLES = [
  {
    number: "01",
    title: "100% Familiar React Primitives",
    body: "File-system App Router, async Server Components, Server Actions, Suspense streaming, and metadata APIs you already know—with zero new DSLs to learn.",
  },
  {
    number: "02",
    title: "Rust + Bun All the Way Down",
    body: "SWC compilation, Bun bundling, native Rust Hyper HTTP routing, SIMD image optimization, and a pre-warmed JavaScriptCore worker pool.",
  },
  {
    number: "03",
    title: "Single-Binary Operations",
    body: "One self-contained executable, one port, ~28 MB idle memory footprint. No node_modules in production, no cold-start jitter, no runtime drift.",
  },
];

const FACTS = [
  { value: "19.6×", label: "Faster SSR p50 (0.90ms)" },
  { value: "1,092", label: "Requests/sec throughput" },
  { value: "4", label: "Switchable render modes" },
  { value: "1", label: "Self-contained binary" },
];

const PIPELINE_STEPS = [
  {
    step: "Stage 1",
    name: "Hyper HTTP + Radix Router",
    detail: "Zero-copy request termination, middleware.ts execution, and guard.ts access checks in <50µs.",
  },
  {
    step: "Stage 2",
    name: "Pre-Warmed JSC Worker Pool",
    detail: "Executes async React 19 Server Components, loader.ts data pipelines, and \"use cache\" segments.",
  },
  {
    step: "Stage 3",
    name: "Streaming HTML + WASM Islands",
    detail: "Flushes chunked HTML immediately and hydrates only interactive \"use client\" islands.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="grid gap-6 border-b border-border pb-10 lg:grid-cols-[0.85fr_1fr] lg:items-end">
        <div>
          <span className="badge badge-accent font-mono">ARCHITECTURE &amp; MISSION</span>
          <h1 className="mt-4 text-balance font-display text-4xl font-bold tracking-tight text-fg sm:text-5xl">
            Built for engineers who <span className="text-accent">ship</span>.
          </h1>
        </div>
        <p className="max-w-xl text-pretty text-[1.025rem] leading-relaxed text-fg-muted lg:justify-self-end">
          Swift Rust closes the gap between the ergonomics of modern full-stack React frameworks and
          the deterministic speed of a native Rust binary.
        </p>
      </header>

      <section className="orange-mesh-card mt-10 overflow-hidden rounded-3xl border border-orange-700 text-white shadow-lg">
        <div className="grid gap-8 p-8 sm:p-10 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <p className="font-mono text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-orange-100">
              Why Swift Rust Exists
            </p>
            <h2 className="mt-3 max-w-xl font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Familiar React 19 on the surface. Systems-grade Rust everywhere it counts.
            </h2>
            <p className="mt-4 max-w-2xl text-pretty text-[0.95rem] leading-relaxed text-orange-50/90">
              We wanted file-system routing, streaming SSR, Server Actions, and built-in media
              optimization—without paying a 17ms SSR latency tax or shipping a 150MB Node.js
              container to production.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {FACTS.map((fact) => (
              <div
                key={fact.label}
                className="rounded-2xl border border-white/20 bg-black/15 p-4 backdrop-blur-xs"
              >
                <p className="font-display text-2xl font-bold text-white sm:text-3xl">
                  {fact.value}
                </p>
                <p className="mt-1 text-[0.75rem] leading-snug text-orange-100/85">
                  {fact.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-14">
        <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-accent">
              Design Philosophy
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Core Engineering Principles
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-fg-subtle">
            Strict architectural constraints keep the framework fast, predictable, and effortless to
            operate at scale.
          </p>
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          {PRINCIPLES.map((principle) => (
            <div key={principle.title} className="bento-card">
              <div>
                <span className="badge badge-accent font-mono">{principle.number}</span>
                <h3 className="mt-4 font-display text-lg font-bold text-fg">{principle.title}</h3>
                <p className="mt-2 text-[0.875rem] leading-relaxed text-fg-muted">
                  {principle.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 rounded-2xl border border-border bg-surface p-7 sm:p-9">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="font-mono text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-accent">
              Request Lifecycle
            </p>
            <h2 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-fg">
              How a request flows in 0.90ms
            </h2>
          </div>
          <span className="badge font-mono">v{siteConfig.version} Runtime</span>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {PIPELINE_STEPS.map((item) => (
            <div key={item.step} className="rounded-xl border border-border bg-bg p-5">
              <span className="font-mono text-[0.72rem] font-semibold text-accent">{item.step}</span>
              <h3 className="mt-2 font-display text-[1rem] font-bold text-fg">{item.name}</h3>
              <p className="mt-1.5 text-[0.85rem] leading-relaxed text-fg-muted">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 flex flex-col gap-6 rounded-2xl border border-border bg-surface p-7 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="font-mono text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-accent">
            Behind the Framework
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">
            Meet the Core Engineering Team
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-muted">
            Systems engineers across runtime, compiler, infrastructure, and design systems building
            the React framework we wanted to deploy ourselves.
          </p>
        </div>
        <Link href="/about/team" className="btn btn-primary shrink-0">
          <span>Meet the Team</span>
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 text-accent"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </section>
    </div>
  );
}
