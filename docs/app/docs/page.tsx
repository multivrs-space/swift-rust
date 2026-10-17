import { DocArticle } from "@/app/components/doc-article";

export default function DocsIndexPage() {
  return (
    <DocArticle>
      <h1>Introduction</h1>
      <p>
        Swift Rust is a full-stack React framework powered with Rust + Bun that combines the
        developer experience of Next.js with the performance and safety of Rust. Write your app in
        TSX, render with a Rust core, and ship a single statically-linked binary — 10x faster than
        Next.js.
      </p>

      <h2>What you'll build</h2>
      <p>
        This is a complete framework, not a renderer. It includes routing, layouts, data fetching,
        image and font optimization, video embeds, PDF generation, error handling, metadata, code
        splitting, and a CLI for scaffolding and adding components.
      </p>

      <div className="grid grid-2" style={{ marginTop: "2rem" }}>
        <a href="/docs/getting-started/installation" className="feature-card">
          <h3>Get started →</h3>
          <p>Install the CLI, scaffold your first project, and run the dev server in 60 seconds.</p>
        </a>
        <a href="/docs/api-reference/components/image" className="feature-card">
          <h3>API reference</h3>
          <p>
            Every component, hook, and configuration option, with examples and TypeScript types.
          </p>
        </a>
      </div>

      <h2>Why a new framework?</h2>
      <p>
        We love Next.js's developer experience — the file-based routing, the layout system, the data
        fetching primitives. But we wanted to ship a single binary with no Node.js runtime, and we
        wanted to keep the option of full-WASM SPAs without a different framework. Swift Rust is the
        result.
      </p>

      <h2>Key features</h2>
      <ul>
        <li>
          <strong>Native Rust HTTP Server &amp; Radix Router</strong>: Built on Axum, Hyper, and{" "}
          <code>matchit</code> with 21ns route dispatch and sub-3ms cold starts.
        </li>
        <li>
          <strong>Embedded JavaScriptCore C-FFI &amp; WASM Navigator</strong>: In-process C-ABI JSX
          evaluation on the server and a compiled WebAssembly SPA router in the browser.
        </li>
        <li>
          <strong>SafeHtml Cryptographic Boundary</strong>: Replaces insecure{" "}
          <code>dangerouslySetInnerHTML</code> with HMAC/BLAKE3 origin verification that allows
          signed server/codebase markup while blocking unauthenticated browser XSS injections.
        </li>
        <li>
          <strong>Server Actions &amp; Partial Prerendering (PPR)</strong>: Full support for{" "}
          <code>&quot;use server&quot;</code> mutations, progressive <code>&lt;Form&gt;</code>,{" "}
          <code>&quot;use cache&quot;</code>, <code>revalidateTag</code>, and streaming PPR shells.
        </li>
        <li>
          <strong>Four rendering modes</strong>: pure SSR, SSR with WASM hydration, SSR with HTMX,
          and full WASM SPAs (plus pure-Rust UI components).
        </li>
        <li>
          <strong>2,071 Google fonts &amp; bundled local fonts</strong> with automatic subsetting
          and <code>size-adjust</code> fallbacks.
        </li>
        <li>
          <strong>Image, Video, Script &amp; PDF components</strong>: Built-in AVIF/WebP{" "}
          <code>&lt;Image&gt;</code>, HTML5/YouTube/Vimeo <code>&lt;Video&gt;</code>, priority{" "}
          <code>&lt;Script&gt;</code> strategies, and declarative <code>&lt;Document&gt;</code> PDF
          generation.
        </li>
        <li>
          <strong>50+ shadcn-style UI components</strong> added with one CLI command:{" "}
          <code>bunx @swift-rust/ui add button card input</code>.
        </li>
        <li>
          <strong>Single binary &amp; Vercel BOA v3 deploy</strong>: <code>swift-rust build</code>{" "}
          emits both a standalone binary and zero-config <code>.vercel/output</code> in
          milliseconds.
        </li>
      </ul>

      <h2>Next steps</h2>
      <p>
        Continue to <a href="/docs/getting-started/installation">Installation</a> to scaffold your
        first project.
      </p>
    </DocArticle>
  );
}
