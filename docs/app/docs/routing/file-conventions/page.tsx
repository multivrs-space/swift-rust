import { DocArticle } from "@/app/components/doc-article";

export const metadata = { title: "Routing file conventions" };

function Code({ lang, children }: { lang: string; children: string }) {
  return (
    <div className="code-block">
      <div className="code-block-header">
        <span>{lang}</span>
      </div>
      <pre>
        <code>{children}</code>
      </pre>
    </div>
  );
}

export default function RoutingFilesPage() {
  return (
    <DocArticle>
      <h1>Routing file conventions</h1>
      <p>
        Swift Rust uses file‑system routing. Beyond <code>page</code> and <code>layout</code>, a set
        of special files co‑located in a route segment add data loading, access control, mutations,
        caching, SEO, and more. Every file is <strong>optional</strong> and{" "}
        <strong>additive</strong> — add one when you need it.
      </p>
      <blockquote>
        Routing files live under your app root — <code>src/app/</code> when you use a{" "}
        <code>src/</code> directory, otherwise <code>app/</code>. The dev server warns at startup if
        it finds a routing file placed where it won&apos;t be picked up.
      </blockquote>

      <h2>Execution order</h2>
      <p>For each matched route, files run in a fixed pipeline (all optional):</p>
      <Code lang="lifecycle">{`runtime (config / edge / worker)
  → proxy            (rewrites, headers, redirects — cheap, no data)
  → schema / query   (validate + type params & searchParams; may 400)
  → guard            (auth / roles / flags; outer → inner; may 401 / 403 / redirect)
  → action           (mutations, on POST/PUT/PATCH/DELETE)   ┐
  → loader + state   (data, in parallel along the chain)      ├ then render
  → render           (shell → layout → template → page)       ┘
  → seo / stream     (head & JSON‑LD; custom streaming)
  → revalidate       (cache TTL + tags)
  on throw → error → error-recovery → not-found → global-error`}</Code>
      <p>
        Files compose <strong>outermost‑first</strong>: a <code>guard</code> or <code>proxy</code>{" "}
        in <code>app/dashboard/</code> runs for every route beneath it. A <code>proxy.ts</code> at
        the app root runs for every request.
      </p>

      <h2>Existing files</h2>
      <ul>
        <li>
          <code>page.tsx</code> — the route&apos;s UI.
        </li>
        <li>
          <code>layout.tsx</code> — shared UI that wraps child routes.
        </li>
        <li>
          <code>loading.tsx</code> — Suspense fallback during the initial stream.
        </li>
        <li>
          <code>error.tsx</code> · <code>global-error.tsx</code> — error boundaries.
        </li>
        <li>
          <code>not-found.tsx</code> — 404 UI.
        </li>
        <li>
          <code>template.tsx</code> · <code>default.tsx</code> — re‑mounting wrapper / parallel‑slot
          default.
        </li>
        <li>
          <code>route.ts</code> — API route handler (GET/POST/…).
        </li>
      </ul>

      <h2>guard.ts — access control</h2>
      <p>
        Runs before loaders and actions. Allow by returning nothing; deny with{" "}
        <code>redirect()</code>, <code>unauthorized()</code> (401), <code>forbidden()</code> (403),
        or <code>notFound()</code>. Pass data to downstream files via <code>locals</code>.
      </p>
      <p>
        <strong>Guards are opt‑in.</strong> A <code>guard.ts</code> only runs when you enable it —
        keeping protection explicit. Three ways, any one is enough:
      </p>
      <ul>
        <li>
          a <code>&quot;use guard&quot;</code> directive at the top of <code>page.tsx</code>,{" "}
          <code>layout.tsx</code>, or <code>config.ts</code> (applies to that tree),
        </li>
        <li>
          <code>config.ts</code> → <code>{"{ guard: true }"}</code> for a segment, or
        </li>
        <li>
          <code>swift-rust.config.json</code> → <code>{"{ autoApplyGuard: true }"}</code> to enforce
          every guard project‑wide (secure‑by‑default; defaults to <code>false</code>).
        </li>
      </ul>
      <Code lang="app/admin/page.tsx">{`'use guard';   // ← drop this in and admin/guard.ts is enforced

export default function Admin() { … }`}</Code>
      <Code lang="app/dashboard/guard.ts">{`import { redirect, forbidden } from "swift-rust/router";

export default async function guard(ctx) {
  const session = await getSession(ctx.cookies.get("sid"));
  if (!session) return redirect("/login?next=" + ctx.url.pathname);
  if (!session.user.isAdmin) return forbidden();
  ctx.locals.set("user", session.user);
}`}</Code>

      <h2>loader.ts — data loading</h2>
      <p>
        Fetches the data a segment needs. Loaders run in parallel along the chain; read the result
        in your page with <code>useLoaderData&lt;typeof loader&gt;()</code>.
      </p>
      <Code lang="app/posts/[slug]/loader.ts">{`import { notFound } from "swift-rust/router";

export default async function loader(ctx) {
  const post = await db.post.find(ctx.params.slug);
  if (!post) notFound();
  return { post };
}
export const cache = { revalidate: 60, tags: ["posts"] };`}</Code>
      <Code lang="app/posts/[slug]/page.tsx">{`import { useLoaderData } from "swift-rust/router";
import loader from "./loader";

export default function Page() {
  const { post } = useLoaderData<typeof loader>();
  return <Article post={post} />;
}`}</Code>

      <h2>action.ts — mutations</h2>
      <p>
        Handles non‑GET requests (form posts, writes). Validate with <code>schema.ts</code>;{" "}
        <code>redirect()</code> on success (POST‑redirect‑GET). Read the result with{" "}
        <code>useActionData()</code>.
      </p>
      <Code lang="app/posts/new/action.ts">{`import { redirect } from "swift-rust/router";
import { PostSchema } from "./schema";

export default async function action(ctx) {
  const form = await ctx.formData();
  const parsed = PostSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: parsed.error.flatten() };
  const post = await db.post.create(parsed.data);
  return redirect(\`/posts/\${post.slug}\`);
}`}</Code>

      <h2>schema.ts — typed inputs</h2>
      <p>
        The source of truth for <code>params</code>, <code>searchParams</code>, and form data. Any
        Standard‑Schema library works (Zod, Valibot). Validated values flow to every file in the
        segment.
      </p>
      <Code lang="app/posts/[slug]/schema.ts">{`import { z } from "zod";

export const params = z.object({ slug: z.string().min(1) });
export const searchParams = z.object({ page: z.coerce.number().default(1) });`}</Code>

      <h2>proxy.ts — request interception</h2>
      <p>
        Cheap, data‑free interception scoped to a subtree: rewrites, headers, redirects, A/B
        buckets. (Formerly <code>middleware.ts</code>, which still works with a warning.) Limit
        paths with <code>matcher</code>.
      </p>
      <Code lang="app/proxy.ts">{`import { rewrite } from "swift-rust/router";

export default function proxy(ctx) {
  if (ctx.url.pathname === "/old") return rewrite("/new");
}
export const matcher = ["/old", "/blog/**"];`}</Code>

      <h2>config.ts — route configuration</h2>
      <p>
        Static per‑segment config (merged inner‑over‑outer). Headers and cache settings are applied
        to the response; <code>runtime</code> selects where the segment executes.
      </p>
      <Code lang="app/dashboard/config.ts">{`export const config = {
  runtime: "bun",           // "bun" (default) | "edge" | "node" | "worker"
  rendering: "ssr-stream",
  revalidate: 120,           // seconds
  headers: { "X-Frame-Options": "DENY" },
};`}</Code>

      <h2>Runtimes — bun · edge · node</h2>
      <p>
        Every route declares a runtime. <strong>Bun is the default</strong> (fast, global). Force a
        different one with a top‑of‑file directive — it applies to the file <em>and its tree</em>,
        just like <code>&quot;use client&quot;</code>:
      </p>
      <Code lang="app/dashboard/page.tsx">{`'use bun';   // ← or 'use edge' / 'use node'

export default function Dashboard() {
  return <main>…</main>;
}`}</Code>
      <p>
        Or set a default per‑segment in <code>config.ts</code>, or project‑wide in{" "}
        <code>swift-rust.config.json</code>. Resolution order, highest priority first:
      </p>
      <Code lang="priority">{`'use bun' | 'use edge' | 'use node'   // file directive — wins
  → config.ts  { runtime: 'edge' }    // per-segment default
  → swift-rust.config.json "runtime"  // project default
  → 'bun'                              // built-in default`}</Code>
      <p>
        The resolved runtime is exposed to every routing file as <code>ctx.runtime</code> and
        emitted on the response as <code>x-swift-rust-runtime</code>. <code>edge.ts</code> /{" "}
        <code>worker.ts</code> remain a file‑based way to force the Edge / Workers runtime.
      </p>
      <p>
        <strong>What each runtime builds to.</strong> A route that explicitly opts into a runtime (a
        directive or <code>config.ts</code> runtime) is emitted as a request‑time{" "}
        <strong>Vercel Function</strong> on that runtime — its full pipeline (<code>proxy</code>,{" "}
        <code>schema</code>, <code>guard</code>, <code>action</code>, <code>loader</code>,{" "}
        <code>state</code>, <code>seo</code>) runs per request:
      </p>
      <ul>
        <li>
          <code>bun</code> — a Bun function (the build sets <code>vercel.json</code> →{" "}
          <code>{'"bunVersion": "1.x"'}</code>).
        </li>
        <li>
          <code>node</code> — a Node.js serverless function.
        </li>
        <li>
          <code>edge</code> — a Vercel Edge function.
        </li>
      </ul>
      <p>
        Routes with no explicit runtime keep the default:{" "}
        <strong>prerendered to static HTML</strong> served from the global edge CDN (the fastest
        path). So <code>bun</code> is the default for request‑time routes, and static is the default
        for everything else.
      </p>

      <h2>revalidate.ts — cache control</h2>
      <p>
        Decides cache TTL and tags per request/mutation. Emits <code>Cache-Control</code> and cache
        tags for on‑demand invalidation.
      </p>
      <Code lang="app/posts/[slug]/revalidate.ts">{`export default function revalidate(ctx) {
  return { ttl: 300, tags: ["post:" + ctx.params.slug] };
}`}</Code>

      <h2>seo.tsx — head &amp; structured data</h2>
      <p>
        Runs with loader data; emits title, description, canonical, OpenGraph, and JSON‑LD into{" "}
        <code>&lt;head&gt;</code>.
      </p>
      <Code lang="app/posts/[slug]/seo.tsx">{`export default function seo(ctx) {
  return {
    title: ctx.data.post.title,
    description: ctx.data.post.excerpt,
    canonical: "https://example.com/posts/" + ctx.params.slug,
    jsonLd: { "@context": "https://schema.org", "@type": "Article", headline: ctx.data.post.title },
  };
}`}</Code>

      <h2>state.ts — client store hydration</h2>
      <p>
        Seeds a client store with server data; serialized to <code>window.__SR_STATE__</code>.
      </p>
      <Code lang="app/dashboard/state.ts">{`export default function state(ctx) {
  return { user: ctx.locals.get("user"), theme: ctx.cookies.get("theme") ?? "light" };
}`}</Code>

      <h2>rpc.ts — typed procedures</h2>
      <p>
        Co‑located, validated procedures callable over <code>POST</code>; <code>GET</code> lists
        them.
      </p>
      <Code lang="app/search/rpc.ts">{`import { z } from "zod";

export const procedures = {
  search: {
    type: "query",
    input: z.object({ q: z.string() }),
    handler: (input, ctx) => db.search(input.q),
  },
};
// POST /search  { "procedure": "search", "input": { "q": "rust" } }`}</Code>

      <h2>stream.ts — streaming responses</h2>
      <p>
        A dedicated streaming endpoint (SSE, chunked JSON, token streams) for a route without a
        page.
      </p>
      <Code lang="app/chat/stream.ts">{`export const contentType = "text/event-stream";
export default function stream(ctx) {
  return new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode("data: hello\\n\\n"));
      c.close();
    },
  });
}`}</Code>

      <h2>edge.ts / worker.ts — runtime targeting</h2>
      <p>
        Force a segment onto the Edge or a Workers runtime. Equivalent to{" "}
        <code>config.runtime</code> with runtime‑specific options.
      </p>
      <Code lang="app/(edge)/ping/edge.ts">{`export const edge = { regions: ["iad1", "fra1"] };`}</Code>

      <h2>variant.tsx — A/B variants</h2>
      <p>
        Render a variant of a segment based on a bucket (from <code>proxy</code>, a cookie, or{" "}
        <code>assign</code>).
      </p>
      <Code lang="app/home/variant.tsx">{`import A from "./home-a";
import B from "./home-b";

export const variants = {
  a: async () => ({ default: A }),
  b: async () => ({ default: B }),
};
export const assign = (ctx) => (ctx.cookies.get("exp") === "b" ? "b" : "a");`}</Code>

      <h2>i18n.ts — locale resolution</h2>
      <p>
        Resolves the active locale (cookie, <code>Accept-Language</code>, or a custom resolver) into{" "}
        <code>locals.locale</code> before render.
      </p>
      <Code lang="app/i18n.ts">{`export const i18n = {
  locales: ["en", "fr", "de"],
  defaultLocale: "en",
  strategy: "cookie",
};`}</Code>

      <h2>error-recovery.tsx — retry UI</h2>
      <p>
        A richer error boundary with retry/reset, used after <code>error.tsx</code>.
      </p>
      <Code lang="app/dashboard/error-recovery.tsx">{`"use client";
export default function ErrorRecovery({ error, retry, attempt }) {
  return (
    <div role="alert">
      <p>Something went wrong: {error.message}</p>
      <button onClick={() => retry()}>Retry ({attempt})</button>
    </div>
  );
}`}</Code>

      <h2>Control‑flow helpers</h2>
      <p>
        Exported from <code>swift-rust/router</code> and usable from <code>guard</code>,{" "}
        <code>loader</code>, <code>action</code>, and <code>proxy</code>:
      </p>
      <ul>
        <li>
          <code>redirect(to, status?)</code> · <code>permanentRedirect(to)</code> ·{" "}
          <code>rewrite(to)</code>
        </li>
        <li>
          <code>notFound()</code> · <code>unauthorized()</code> (401) · <code>forbidden()</code>{" "}
          (403)
        </li>
      </ul>

      <h2>Client navigation</h2>
      <p>
        <code>&lt;Link&gt;</code> and plain <code>&lt;a&gt;</code> links to same‑origin routes are
        upgraded to client‑side navigation automatically: the next page is fetched, the body is
        swapped, scripts re‑run, <code>&lt;title&gt;</code> and meta are synced, and back/forward
        history is managed — no full reload. It degrades to ordinary links when JavaScript is off.
      </p>

      <h2>prefetch.ts — link prefetching</h2>
      <p>
        Controls how links are prefetched into the navigator&apos;s cache. The nearest{" "}
        <code>prefetch.ts</code> up the tree wins; opt a single link out with{" "}
        <code>{"<Link prefetch={false}>"}</code>.
      </p>
      <Code lang="app/prefetch.ts">{`export const strategy = "viewport"; // "hover" (default) | "viewport" | "none"
export const margin = "300px";        // IntersectionObserver rootMargin`}</Code>

      <h2>pending.tsx — navigation pending UI</h2>
      <p>
        Shown while a client navigation is in flight — but only once it outlasts a ~120ms threshold,
        so fast/cached navigations don&apos;t flash it. Rendered into a fixed overlay; style it as a
        top progress bar or spinner.
      </p>
      <Code lang="app/pending.tsx">{`export default function Pending() {
  return <div className="route-progress" />;
}`}</Code>

      <h2>transition.tsx — view transitions</h2>
      <p>
        Wraps the navigation swap in the View Transitions API. Falls back to a plain swap when the
        API is unsupported, <code>type</code> is <code>&quot;none&quot;</code>, or the user prefers
        reduced motion.
      </p>
      <Code lang="app/transition.tsx">{`export const type = "slide";  // "fade" (default) | "slide" | "none"
export const duration = 250;    // ms`}</Code>

      <h2>Parallel routes — @slots</h2>
      <p>
        A layout directory can hold named slot folders (<code>@modal</code>, <code>@sidebar</code>).
        Each slot resolves against the URL independently and is passed to the layout as a prop
        alongside <code>children</code>.
      </p>
      <Code lang="app/dashboard/layout.tsx">{`export default function Layout({ children, modal }) {
  return <>{children}{modal}</>;
}`}</Code>
      <ul>
        <li>
          <code>@modal/page.tsx</code> · <code>@modal/fragment.tsx</code> — the slot&apos;s matched
          leaf (use <code>fragment.tsx</code> for reusable modal/drawer content).
        </li>
        <li>
          <code>@modal/default.tsx</code> — rendered when the slot has no match for the current URL.
        </li>
        <li>
          <code>@modal/fallback.tsx</code> — Suspense fallback while the slot loads.
        </li>
      </ul>

      <h2>shell.tsx — the outer document</h2>
      <p>
        A root‑only file that owns the outer document — <code>&lt;html&gt;</code>,{" "}
        <code>&lt;body&gt;</code>, and top‑level providers. The framework still injects its head
        assets (metadata, fonts, global CSS, the client navigator) into your{" "}
        <code>&lt;head&gt;</code>, and client scripts before <code>&lt;/body&gt;</code>. Use it for
        app‑wide context providers or a custom document structure; with a shell, your root{" "}
        <code>layout.tsx</code> returns a fragment rather than its own <code>&lt;html&gt;</code>.
      </p>
      <Code lang="app/shell.tsx">{`export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head />
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}`}</Code>

      <h2>instrumentation.ts — startup hooks</h2>
      <p>
        Place <code>instrumentation.ts</code> in your project root (or <code>src/</code>) and export
        a <code>register()</code> function to initialize OpenTelemetry, error trackers, or database
        connection pools once when the server starts.
      </p>
      <Code lang="src/instrumentation.ts">{`export async function register() {
  await initTelemetry({ serviceName: "my-app" });
}`}</Code>

      <h2>robots.ts &amp; sitemap.ts — dynamic SEO</h2>
      <p>
        Generate <code>/robots.txt</code> and <code>/sitemap.xml</code> dynamically at request time
        or pre-render them at build time by placing <code>robots.ts</code> and{" "}
        <code>sitemap.ts</code> in your <code>app/</code> root.
      </p>
      <Code lang="app/robots.ts">{`export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: ["/"], disallow: ["/admin"] }],
    sitemap: "https://example.com/sitemap.xml",
  };
}`}</Code>
      <Code lang="app/sitemap.ts">{`export default async function sitemap() {
  return [
    { url: "https://example.com/", lastModified: "2026-01-01", priority: 1.0 },
  ];
}`}</Code>

      <h2>Folder &amp; segment conventions</h2>
      <ul>
        <li>
          <code>[param]</code> — single dynamic segment (<code>ctx.params.param</code>).
        </li>
        <li>
          <code>[...slug]</code> — catch‑all segment matching one or more path parts.
        </li>
        <li>
          <code>[[...slug]]</code> — optional catch‑all matching the base route as well as nested
          segments.
        </li>
        <li>
          <code>(group)</code> — route group; organizes files without appearing in the URL path.
        </li>
        <li>
          <code>(.)segment</code>, <code>(..)segment</code>, <code>(...)segment</code> —
          intercepting routes that render a modal/overlay on soft client navigation while rendering
          the target page on hard refresh.
        </li>
        <li>
          <code>_folder</code> — private folder; opted out of routing completely.
        </li>
        <li>
          <code>%5Ffolder</code> — URL‑escaped underscore; maps to a literal <code>/_folder</code>{" "}
          URL segment.
        </li>
      </ul>
    </DocArticle>
  );
}
