import { DocArticle } from "@/app/components/doc-article";
export const metadata = { title: "Migrating from Next.js" };

export default function MigratingPage() {
  return (
    <DocArticle>
      <h1>Migrating from Next.js</h1>
      <p>
        Most Next.js projects will migrate to Swift Rust with minimal effort. The file-based router,
        the layout system, the data-fetching patterns, and the components are all familiar.
      </p>

      <h2>What stays the same</h2>
      <ul>
        <li>
          The <code>app/</code> directory layout
        </li>
        <li>
          <code>layout.tsx</code>, <code>page.tsx</code>, <code>loading.tsx</code>,{" "}
          <code>error.tsx</code>, <code>not-found.tsx</code>
        </li>
        <li>
          Dynamic segments (<code>[slug]</code>, <code>[...catchAll]</code>)
        </li>
        <li>
          Route handlers (<code>app/api/foo/route.ts</code> with <code>GET</code>, <code>POST</code>
          )
        </li>
        <li>
          The <code>Image</code>, <code>Font</code>, and <code>Head</code> components
        </li>
        <li>
          Server components by default, <code>"use client"</code> for client components
        </li>
      </ul>

      <h2>What changes</h2>

      <h3>Package names</h3>
      <p>
        Replace <code>next</code> with <code>swift-rust</code> everywhere. Import paths become:
      </p>
      <ul>
        <li>
          <code>next/image</code> → <code>swift-rust</code> (the <code>Image</code> component)
        </li>
        <li>
          <code>next/font/google</code> → <code>swift-rust/font/google</code>
        </li>
        <li>
          <code>next/font/local</code> → <code>swift-rust/font/local</code>
        </li>
        <li>
          <code>next/link</code> → <code>swift-rust</code> (the <code>Link</code> component)
        </li>
        <li>
          <code>next/script</code> → <code>swift-rust</code> (the <code>Script</code> component)
        </li>
        <li>
          <code>next/form</code> → <code>swift-rust</code> (the <code>Form</code> component)
        </li>
        <li>
          <code>next/cache</code> → <code>swift-rust</code> (<code>revalidatePath</code>,{" "}
          <code>revalidateTag</code>, <code>cache</code>)
        </li>
        <li>
          <code>next/navigation</code> → <code>swift-rust/router</code>
        </li>
        <li>
          <code>next/server</code> → <code>swift-rust/router</code>
        </li>
      </ul>

      <h3>Upgraded &amp; Replaced Primitives</h3>
      <ul>
        <li>
          <code>dangerouslySetInnerHTML</code> → <code>&lt;SafeHtml&gt;</code> &amp;{" "}
          <code>createTrustedHtml()</code> from <code>swift-rust</code>. Unauthenticated raw strings
          injected in the browser are automatically blocked and escaped.
        </li>
        <li>
          <code>middleware.ts</code> → <code>proxy.ts</code> (matches Next.js 16+ proxy convention;
          runs at the root and per-segment).
        </li>
        <li>
          <code>next.config.js</code> → <code>swift-rust.config.json</code> or{" "}
          <code>defineConfig()</code>.
        </li>
        <li>
          <code>next-env.d.ts</code> → not needed; types come from <code>swift-rust</code> directly.
        </li>
      </ul>

      <h3>Server actions, PPR &amp; Special Files</h3>
      <p>
        Server actions (<code>&quot;use server&quot;</code>), Partial Prerendering (
        <code>experimental_ppr = true</code>), <code>&quot;use cache&quot;</code>,{" "}
        <code>template.tsx</code>, <code>default.tsx</code>, <code>instrumentation.ts</code>,{" "}
        <code>robots.ts</code>, and <code>sitemap.ts</code> all work out of the box with zero
        configuration changes.
      </p>

      <h3>Image loader</h3>
      <p>
        The <code>loader</code> prop on <code>&lt;Image&gt;</code> uses{" "}
        <code>/_swift-rust/image</code> instead of <code>/_next/image</code>. If you have a custom
        loader, point it at the new path.
      </p>

      <h3>Render modes</h3>
      <p>
        Set <code>"rendering": "ssr-wasm"</code> in <code>swift-rust.config.json</code> to match the
        Next.js App Router's behavior. Other modes (<code>"ssr"</code>, <code>"ssr-htmx"</code>,{" "}
        <code>"wasm"</code>) don't have direct Next.js equivalents.
      </p>

      <h2>Step-by-step migration</h2>
      <ol>
        <li>Scaffold a new Swift Rust project alongside your existing one.</li>
        <li>
          Copy <code>app/</code>, <code>components/</code>, and <code>lib/</code> across.
        </li>
        <li>
          Run a search-and-replace for <code>from "next/</code> to <code>from "swift-rust/</code>{" "}
          (or for just <code>from "swift-rust</code>).
        </li>
        <li>
          Update <code>package.json</code> dependencies.
        </li>
        <li>
          Update <code>tsconfig.json</code> paths if needed (Swift Rust uses the same{" "}
          <code>"@/*"</code> convention by default).
        </li>
        <li>
          Run <code>bun install</code> and <code>bun run dev</code>.
        </li>
      </ol>
    </DocArticle>
  );
}
