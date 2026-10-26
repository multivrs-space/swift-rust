import { DocArticle } from "@/app/components/doc-article";
export const metadata = { title: "CLI" };

export default function CliRefPage() {
  return (
    <DocArticle>
      <h1>CLI</h1>
      <p>
        The framework ships the <code>swift-rust</code> binary for the dev server, builds, and
        scaffolding. UI components are added with a separate <code>swift-rust-ui</code> binary from
        the <code>@swift-rust/ui</code> package, so the two never collide when installed together.
      </p>

      <h2>
        <code>swift-rust dev</code>
      </h2>
      <p>Start the dev server with hot module replacement, error overlay, and request timing.</p>
      <div className="code-block">
        <div className="code-block-header">
          <span>terminal</span>
        </div>
        <pre>
          <code>{`bunx swift-rust dev
bunx swift-rust dev --port 4000
bunx swift-rust dev --open`}</code>
        </pre>
      </div>

      <h2>
        <code>swift-rust build</code>
      </h2>
      <p>
        Build for production. <code>--target</code> picks the deploy platform: <code>multivrs</code>{" "}
        (the default) writes <code>dist/</code>; <code>vercel</code> writes{" "}
        <code>.vercel/output</code>. Without the flag, the build uses <code>"target"</code> from{" "}
        <code>swift-rust.config.json</code>, then <code>vercel</code> when <code>VERCEL=1</code> is
        set, otherwise <code>multivrs</code>. See{" "}
        <a href="/docs/getting-started/deploying">Deploying</a>.
      </p>
      <div className="code-block">
        <div className="code-block-header">
          <span>terminal</span>
        </div>
        <pre>
          <code>{`bunx swift-rust build                   # Multivrs → dist/
bunx swift-rust build --target vercel   # Vercel → .vercel/output`}</code>
        </pre>
      </div>

      <h2>
        <code>swift-rust start</code>
      </h2>
      <p>Start the production server from a built binary.</p>
      <div className="code-block">
        <div className="code-block-header">
          <span>terminal</span>
        </div>
        <pre>
          <code>{"bunx swift-rust start --port 3210"}</code>
        </pre>
      </div>

      <h2>
        <code>swift-rust-ui add</code>
      </h2>
      <p>Add shadcn-style UI components to your project.</p>
      <div className="code-block">
        <div className="code-block-header">
          <span>terminal</span>
        </div>
        <pre>
          <code>{`bunx @swift-rust/ui add button card input
bunx @swift-rust/ui add --all
bunx @swift-rust/ui add dialog --dir src/components/ui --overwrite`}</code>
        </pre>
      </div>

      <h2>
        <code>swift-rust-ui init</code>
      </h2>
      <p>Initialize the UI registry in an existing project.</p>
      <div className="code-block">
        <div className="code-block-header">
          <span>terminal</span>
        </div>
        <pre>
          <code>{`bunx @swift-rust/ui init
bunx @swift-rust/ui init --dir src/lib`}</code>
        </pre>
      </div>

      <h2>
        <code>swift-rust-ui list</code>
      </h2>
      <p>List all 35 available UI components.</p>
    </DocArticle>
  );
}
