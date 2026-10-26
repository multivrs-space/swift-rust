import { DocArticle } from "@/app/components/doc-article";
export const metadata = { title: "Deploying" };

export default function DeployingPage() {
  return (
    <DocArticle>
      <h1>Deploying</h1>
      <p>
        <code>swift-rust build</code> supports two deploy targets. <strong>Multivrs</strong> is the
        default. <strong>Vercel</strong> is picked automatically when the build runs on Vercel. The
        same repository deploys to both with no extra config.
      </p>

      <h2>Choosing a target</h2>
      <ol>
        <li>
          <code>--target multivrs</code> or <code>--target vercel</code> on the command line.
        </li>
        <li>
          <code>"target"</code> in <code>swift-rust.config.json</code> pins it for the project.
        </li>
        <li>
          <code>vercel</code> when <code>VERCEL=1</code> is set (Vercel sets this during builds).
        </li>
        <li>
          Otherwise <code>multivrs</code>.
        </li>
      </ol>
      <div className="code-block">
        <div className="code-block-header">
          <span>swift-rust.config.json</span>
        </div>
        <pre>
          <code>{`{
  "target": "multivrs"
}`}</code>
        </pre>
      </div>

      <h2>Deploy to Multivrs (default)</h2>
      <p>
        Push the repo to Multivrs, which runs <code>bun run build</code>. Locally:
      </p>
      <div className="code-block">
        <div className="code-block-header">
          <span>terminal</span>
        </div>
        <pre>
          <code>{`bun install --frozen-lockfile
NODE_ENV=production bunx swift-rust build
# dist/
#   multivrs-build.json   build manifest
#   server.mjs            self-contained server (all deps bundled)
#   static/               uploaded to the CDN as-is`}</code>
        </pre>
      </div>
      <ul>
        <li>
          Prerendered pages go to <code>dist/static/</code> and are served from the CDN at the same
          path. They are listed in the manifest with <code>"renderMode": "wasm"</code>, along with
          <code>404.html</code>, favicons, fonts and island bundles.
        </li>
        <li>
          Request-time routes (dynamic <code>[param]</code> and catch-all routes without{" "}
          <code>generateStaticParams</code>, and routes that opt into a runtime with{" "}
          <code>"use bun"</code> / <code>"use node"</code>) are bundled into{" "}
          <code>dist/server.mjs</code>. They are listed as <code>"renderMode": "ssr"</code>,{" "}
          <code>"runtime": "bun"</code>.
        </li>
        <li>
          Images go through <code>/_swift-rust/image</code> on the server, not Vercel's optimizer.
        </li>
        <li>
          Runtime env vars are read from <code>process.env</code> at request time. Values from{" "}
          <code>.env.production</code> act as defaults. <code>SWIFT_RUST_PUBLIC_*</code> vars are
          inlined at build time.
        </li>
      </ul>
      <p>Run the production server exactly as Multivrs does:</p>
      <div className="code-block">
        <div className="code-block-header">
          <span>terminal</span>
        </div>
        <pre>
          <code>{`cd dist && PORT=8080 bun server.mjs`}</code>
        </pre>
      </div>
      <p>
        The server listens on <code>0.0.0.0:$PORT</code>. When <code>dist/static/</code> sits next
        to it, the server also serves those files, which is handy locally. Each request is logged to
        stdout.
      </p>
      <div className="code-block">
        <div className="code-block-header">
          <span>dist/multivrs-build.json</span>
        </div>
        <pre>
          <code>{`{
  "framework": "swift-rust",
  "binary": "server.mjs",
  "staticDir": "static",
  "routes": [
    { "src": "/_swift-rust/image/?", "renderMode": "ssr", "runtime": "bun" },
    { "src": "/about/?", "renderMode": "wasm" },
    { "src": "/", "renderMode": "wasm" },
    { "src": "/b/[^/]+/?", "renderMode": "ssr", "runtime": "bun" }
  ]
}`}</code>
        </pre>
      </div>
      <p>
        Each <code>src</code> is a regular expression matched as <code>^(?:src)$</code> against the
        pathname.
      </p>

      <h2>Deploy to Vercel</h2>
      <p>
        Every new app from <code>create-swift-rust</code> ships with a <code>vercel.json</code>. To
        deploy:
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
          Click <strong>Deploy</strong>. Vercel sets <code>VERCEL=1</code> and runs{" "}
          <code>bun run build</code>, which writes the Build Output API v3 to{" "}
          <code>.vercel/output/</code>.
        </li>
      </ol>
      <p>
        Prerendered pages are served from Vercel's CDN. Request-time routes become Vercel Functions,
        and the build sets <code>"bunVersion"</code> in <code>vercel.json</code> for Bun functions.
        Images use Vercel's optimizer at <code>/_vercel/image</code>. To produce the Vercel output
        locally:
      </p>
      <div className="code-block">
        <div className="code-block-header">
          <span>terminal</span>
        </div>
        <pre>
          <code>{`bunx swift-rust build --target vercel`}</code>
        </pre>
      </div>

      <h2>Environment variables</h2>
      <ul>
        <li>
          <code>PORT</code> — the port <code>server.mjs</code> binds to on <code>0.0.0.0</code>{" "}
          (default: <code>8080</code>)
        </li>
        <li>
          <code>DATABASE_URL</code> — and any others you load via <code>@swift-rust/env</code>
        </li>
      </ul>

      <h2>Docker</h2>
      <p>
        <code>dist/</code> runs anywhere Bun does, with no install step:
      </p>
      <div className="code-block">
        <div className="code-block-header">
          <span>Dockerfile</span>
        </div>
        <pre>
          <code>{`FROM oven/bun:1 AS builder
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile && NODE_ENV=production bunx swift-rust build --target multivrs

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/dist ./
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "server.mjs"]`}</code>
        </pre>
      </div>

      <h2>Static export</h2>
      <p>
        For pure static sites, set <code>"output": "export"</code> in your config. The build will
        produce an
        <code>out/</code> directory you can upload to any static host (Cloudflare Pages, Vercel, S3,
        etc.).
      </p>

      <h2>Next steps</h2>
      <p>
        Continue to <a href="/docs/guides/migrating-from-nextjs">Migrating from Next.js</a> if
        you're coming from a Next.js project.
      </p>
    </DocArticle>
  );
}
