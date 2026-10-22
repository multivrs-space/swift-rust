import { siteConfig } from "@/app/site.config";

export default function HomePage() {
  return (
    <div>
      <section className="hero">
        <div className="badge" style={{ marginBottom: "1.5rem" }}>
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "var(--accent)",
            }}
          />
          v{siteConfig.version} — Now in beta
        </div>
        <h1>
          The React framework
          <br />
          <span className="text-accent">Powered</span> with Rust +{" "}
          <span className="text-accent">Bun</span> that thinks like Next.js
        </h1>
        <p>
          Write TSX, render with Rust, ship a single binary. 10x faster than Next.js, four rendering
          modes, 2,071 Google fonts, image and video optimization, shadcn-style components, and a
          single CLI to scaffold it all.
        </p>
        <div className="hero-cta">
          <a href="/docs/getting-started/installation" className="btn btn-primary">
            Get started →
          </a>
          <a href="https://github.com/multivrs-space/swift-rust" className="btn btn-outline">
            View on GitHub
          </a>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-value">2,071</span>
            <span className="hero-stat-label">Google fonts</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-value">4</span>
            <span className="hero-stat-label">Rendering modes</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-value">35</span>
            <span className="hero-stat-label">UI components</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-value">1</span>
            <span className="hero-stat-label">Single binary</span>
          </div>
        </div>
      </section>

      <div className="section-title">The basics</div>
      <div className="grid grid-3">
        <a href="/docs/getting-started/installation" className="feature-card">
          <div className="feature-card-icon">1</div>
          <h3>Install</h3>
          <p>
            Scaffold a new project with one command. TypeScript, Biome, Tailwind, shadcn UI — all
            optional.
          </p>
        </a>
        <a href="/docs/getting-started/layouts-and-pages" className="feature-card">
          <div className="feature-card-icon">2</div>
          <h3>Build</h3>
          <p>
            Author pages and layouts in TSX. File-based routing, layouts, loading states, error
            boundaries.
          </p>
        </a>
        <a href="/docs/getting-started/deploying" className="feature-card">
          <div className="feature-card-icon">3</div>
          <h3>Ship</h3>
          <p>
            One command produces a single, statically-linked binary. No Node, no npm at runtime.
          </p>
        </a>
      </div>

      <div className="section-title">Built-in components</div>
      <div className="grid grid-2">
        <a href="/components/image" className="feature-card">
          <div className="feature-card-icon">📷</div>
          <h3>Image</h3>
          <p>
            Drop-in image component with automatic AVIF/WebP, responsive srcset, blur-up
            placeholders, and lazy loading.
          </p>
        </a>
        <a href="/components/font" className="feature-card">
          <div className="feature-card-icon">Aa</div>
          <h3>Font</h3>
          <p>
            2,071 Google fonts, local fonts (OTF, TTF, WOFF, WOFF2), and automatic size-adjusted
            fallbacks.
          </p>
        </a>
        <a href="/videos" className="feature-card">
          <div className="feature-card-icon">▶</div>
          <h3>Video</h3>
          <p>
            HTML5 video, YouTube and Vimeo embeds, lightbox mode, background video, captions, and
            poster images.
          </p>
        </a>
        <a href="/components/pdf" className="feature-card">
          <div className="feature-card-icon">📄</div>
          <h3>PDF</h3>
          <p>
            Declarative PDF document tree — Document, Page, Text, View — compiled to a single binary
            PDF.
          </p>
        </a>
      </div>

      <div className="section-title">Code preview</div>
      <div className="code-block">
        <div className="code-block-header">
          <span>app/page.tsx</span>
          <span>TypeScript</span>
        </div>
        <pre>
          <code>{`import { Image } from "swift-rust/image";
import { Inter } from "swift-rust/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: true });

export default function Home() {
  return (
    <main className={\`\${inter.variable} min-h-screen p-12\`}>
      <h1 className="text-5xl font-bold tracking-tight">
        Hello, Swift Rust
      </h1>
      <Image
        src="/hero.jpg"
        alt="Hero"
        width={1200}
        height={600}
        priority
        className="rounded-xl"
      />
    </main>
  );
}`}</code>
        </pre>
      </div>

      <div className="section-title">Why Swift Rust?</div>
      <div className="grid">
        <div className="feature-card">
          <h3>No JavaScript runtime required</h3>
          <p>
            The Rust rendering core replaces Node.js, V8, and your entire SSR pipeline. Deploy as a
            single binary to any Linux host with no dependencies.
          </p>
        </div>
        <div className="feature-card">
          <h3>Four rendering modes in one framework</h3>
          <p>
            Pick <code>ssr</code> for pure server-rendered HTML, <code>ssr-wasm</code> for hydrated
            React via WebAssembly,
            <code>ssr-htmx</code> for progressive enhancement, or <code>wasm</code> for a fully
            client-side SPA.
          </p>
        </div>
        <div className="feature-card">
          <h3>shadcn-style components out of the box</h3>
          <p>
            35 accessible, copy-paste components you can own forever. Add them with a single CLI
            command, customize freely, no vendor lock-in.
          </p>
        </div>
      </div>
    </div>
  );
}
