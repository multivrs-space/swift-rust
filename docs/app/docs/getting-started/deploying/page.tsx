import { DocArticle } from "@/app/components/doc-article";
export const metadata = { title: "Deploying" };

export default function DeployingPage() {
  return (
    <DocArticle>
      <h1>Deploying</h1>
      <p>
        Swift Rust produces a single statically-linked binary. You can deploy it anywhere Linux runs
        — Docker containers, bare metal, Kubernetes, or a $5 VPS.
      </p>

      <h2>Build for production</h2>
      <div className="code-block">
        <div className="code-block-header">
          <span>terminal</span>
        </div>
        <pre>
          <code>{`bun run build
# → ./target/release/swift-rust-app
# A single binary, ~12-20MB, no Node required`}</code>
        </pre>
      </div>

      <h2>Run the production server</h2>
      <div className="code-block">
        <div className="code-block-header">
          <span>terminal</span>
        </div>
        <pre>
          <code>{"PORT=3000 ./target/release/swift-rust-app"}</code>
        </pre>
      </div>

      <h2>Environment variables</h2>
      <ul>
        <li>
          <code>PORT</code> — the port to bind to (default: <code>3000</code>)
        </li>
        <li>
          <code>HOST</code> — the host to bind to (default: <code>0.0.0.0</code>)
        </li>
        <li>
          <code>DATABASE_URL</code> — and any others you load via <code>@swift-rust/env</code>
        </li>
      </ul>

      <h2>Docker</h2>
      <div className="code-block">
        <div className="code-block-header">
          <span>Dockerfile</span>
        </div>
        <pre>
          <code>{`FROM rust:1.85-slim AS builder
WORKDIR /app
COPY . .
RUN bun install && bun run build

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/swift-rust-app /usr/local/bin/app
EXPOSE 3000
CMD ["/usr/local/bin/app"]`}</code>
        </pre>
      </div>

      <h2>Static export</h2>
      <p>
        For pure static sites, set <code>"output": "export"</code> in your config. The build will
        produce an
        <code>out/</code> directory you can upload to any static host (Cloudflare Pages, Vercel, S3,
        etc.).
      </p>

      <h2>Deploy to Vercel</h2>
      <p>
        Every new app from <code>create-swift-rust</code> ships with a <code>vercel.json</code>
        preconfigured for the Swift Rust build output. To deploy:
      </p>
      <ol>
        <li>Push your project to a GitHub repository.</li>
        <li>
          Go to{" "}
          <a href="https://vercel.com/new" target="_blank" rel="noopener">
            vercel.com/new
          </a>{" "}
          and import the repo.
        </li>
        <li>
          Click <strong>Deploy</strong>. Vercel will run <code>bun run build</code> which produces{" "}
          <code>.vercel/output/</code> and serves it on the CDN.
        </li>
      </ol>
      <p>
        The static export supports pre-rendered pages, 404 handling, immutable asset caching, and
        <code>generateStaticParams</code> for catch-all routes. Serverless functions, ISR, and Edge
        runtime are planned for v0.2.0.
      </p>
      <p>
        To deploy the same project to a different provider, run <code>bun run build</code> locally
        and upload the contents of <code>.vercel/output/static/</code> to any static host (Netlify,
        Cloudflare Pages, S3 + CloudFront, GitHub Pages).
      </p>

      <h2>Next steps</h2>
      <p>
        Continue to <a href="/docs/guides/migrating-from-nextjs">Migrating from Next.js</a> if
        you're coming from a Next.js project.
      </p>
    </DocArticle>
  );
}
