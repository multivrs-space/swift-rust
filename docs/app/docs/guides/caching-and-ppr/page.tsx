import { DocArticle } from "@/app/components/doc-article";

export const metadata = { title: "Partial Prerendering (PPR) and Caching" };

export default function CachingAndPprGuidePage() {
  return (
    <DocArticle>
      <h1>Partial Prerendering (PPR) &amp; Caching</h1>
      <p>
        Swift Rust combines pre-computed static HTML shells with dynamic server streams using
        Partial Prerendering (PPR) and fine-grained cache directives.
      </p>

      <h2>Partial Prerendering (PPR)</h2>
      <p>
        PPR serves a static HTML shell instantly from the edge while streaming dynamic holes in
        parallel over the same HTTP connection.
      </p>

      <div className="code-block">
        <div className="code-block-header">
          <span>app/product/[id]/page.tsx</span>
        </div>
        <pre>
          <code>{`import { Suspense } from "react";
import { StaticHeader } from "./header";
import { DynamicInventory } from "./inventory";

export const experimental_ppr = true;

export default function ProductPage({ params }: { params: { id: string } }) {
  return (
    <div>
      {/* Pre-rendered instantly into the static shell */}
      <StaticHeader />

      {/* Streamed dynamically through the Rust server socket */}
      <Suspense fallback={<div>Loading stock...</div>}>
        <DynamicInventory productId={params.id} />
      </Suspense>
    </div>
  );
}`}</code>
        </pre>
      </div>

      <h2>The &quot;use cache&quot; Directive</h2>
      <p>
        Annotate async functions or components with <code>&quot;use cache&quot;</code> to memoize
        expensive database operations or external API calls:
      </p>

      <div className="code-block">
        <div className="code-block-header">
          <span>app/data.ts</span>
        </div>
        <pre>
          <code>{`export async function getTopStories() {
  "use cache";
  return await fetchNewsFromUpstream();
}`}</code>
        </pre>
      </div>

      <h2>On-Demand Revalidation</h2>
      <p>
        Invalidate cached items programmatically using <code>revalidatePath</code> or{" "}
        <code>revalidateTag</code>:
      </p>

      <div className="code-block">
        <div className="code-block-header">
          <span>app/api/revalidate/route.ts</span>
        </div>
        <pre>
          <code>{`import { revalidateTag, revalidatePath } from "swift-rust";

export async function POST(req: Request) {
  const { tag, path } = await req.json();

  if (tag) revalidateTag(tag);
  if (path) revalidatePath(path);

  return Response.json({ revalidated: true, now: Date.now() });
}`}</code>
        </pre>
      </div>
    </DocArticle>
  );
}
