import { DesignMorph } from "@/components/site/design-morph";
import { Button } from "@/components/ui/button";
import { COMPONENT_COUNTS } from "@/lib/components";

const DIMENSIONS = [
  {
    name: "variant",
    description: "Set the component's intent with familiar defaults.",
    values: ["default", "outline", "secondary", "ghost"],
  },
  {
    name: "size",
    description: "Move from compact controls to spacious calls to action.",
    values: ["xs", "sm", "default", "lg", "icon"],
  },
  {
    name: "design",
    description: "Change the surface treatment without changing the API.",
    values: ["flat", "soft", "3d", "glass", "neo", "brutal"],
  },
];

export default function Home() {
  return (
    <div>
      <section className="border-b border-border px-6 py-24 text-center sm:px-8 sm:py-32 lg:px-12">
        <a
          href="/docs/components"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
        >
          <span className="size-1.5 rounded-full bg-accent" />
          {COMPONENT_COUNTS.total} components for Tailwind v4
          <span aria-hidden>→</span>
        </a>
        <h1 className="mx-auto mt-8 max-w-5xl font-display text-5xl font-semibold leading-[1.02] tracking-[-0.04em] sm:text-7xl lg:text-8xl">
          The component library for swift-rust.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-fg-muted sm:text-xl">
          Beautifully designed, accessible components you can copy, customize, and make your own.
          Open code, built for the framework.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <a href="/docs">Get started</a>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href="/docs/components">Browse components</a>
          </Button>
        </div>
        <code className="mt-5 inline-flex rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-fg-muted">
          <span className="mr-2 select-none text-fg-subtle">$</span>
          bunx @swift-rust/ui add button
        </code>
      </section>

      <section className="border-b border-border p-4 sm:p-6 lg:p-8">
        <DesignMorph />
      </section>

      <section className="border-b border-border">
        <div className="grid lg:grid-cols-[0.7fr_1.3fr]">
          <div className="border-b border-border p-8 sm:p-12 lg:border-r lg:border-b-0">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
              One API
            </span>
            <h2 className="mt-4 max-w-md font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              More range without more complexity.
            </h2>
            <p className="mt-4 max-w-md leading-relaxed text-fg-muted">
              Every component shares the same predictable axes, so your interface stays consistent
              as it grows.
            </p>
          </div>
          <div className="grid sm:grid-cols-3">
            {DIMENSIONS.map((dimension, index) => (
              <div
                key={dimension.name}
                className="border-b border-border p-8 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
              >
                <span className="font-mono text-xs text-fg-subtle">0{index + 1}</span>
                <h3 className="mt-8 font-mono text-sm text-accent">{dimension.name}</h3>
                <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                  {dimension.description}
                </p>
                <div className="mt-6 flex flex-wrap gap-1.5">
                  {dimension.values.map((value) => (
                    <span
                      key={value}
                      className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-xs text-fg-muted"
                    >
                      {value}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-col items-start justify-between gap-8 px-6 py-16 sm:px-8 md:flex-row md:items-center lg:px-12 lg:py-20">
        <div>
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Start with the components you need.
          </h2>
          <p className="mt-3 max-w-2xl text-fg-muted">
            Copy them into your project, keep every line, and shape the system around your product.
          </p>
        </div>
        <Button asChild size="lg" className="shrink-0">
          <a href="/docs/components">Explore all {COMPONENT_COUNTS.total}</a>
        </Button>
      </section>

      <footer className="flex flex-col gap-3 border-t border-border px-6 py-8 text-sm text-fg-subtle sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <span>swift-rust ui — open code for the swift-rust framework.</span>
        <a
          className="transition-colors hover:text-fg"
          href="https://github.com/multivrs-space/swift-rust"
        >
          GitHub →
        </a>
      </footer>
    </div>
  );
}
