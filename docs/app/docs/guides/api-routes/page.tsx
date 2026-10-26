import { DocArticle } from "@/app/components/doc-article";
export const metadata = { title: "API routes" };

export default function ApiRoutesPage() {
  return (
    <DocArticle>
      <h1>API routes</h1>
      <p>
        API routes are <code>route.ts</code> files under <code>app/api/</code>. They export
        functions named after HTTP methods (<code>GET</code>, <code>POST</code>, <code>PUT</code>,{" "}
        <code>DELETE</code>, etc). A <code>route.ts</code> outside <code>app/api/</code> is not
        routed.
      </p>

      <h2>The handler context</h2>
      <p>
        Each handler receives one object (not Next.js&apos;s <code>(request, {"{ params }"})</code>
        ):
      </p>
      <ul>
        <li>
          <code>request</code> — the standard Fetch <code>Request</code>
        </li>
        <li>
          <code>params</code> — dynamic segments; <code>[...slug]</code> is an array
        </li>
        <li>
          <code>query</code> / <code>searchParams</code> — the query string as an object
        </li>
        <li>
          <code>body</code> — the request body, parsed as JSON when possible, otherwise text
        </li>
      </ul>
      <p>
        Return a <code>Response</code>, a plain object (sent as JSON, using its <code>status</code>{" "}
        field if present), or a string (sent as <code>text/plain</code>). A method you don&apos;t
        export gets a 405 with an <code>Allow</code> header; an unknown path under <code>/api</code>{" "}
        gets a JSON 404.
      </p>

      <h2>A simple GET handler</h2>
      <div className="code-block">
        <div className="code-block-header">
          <span>app/api/posts/route.ts</span>
        </div>
        <pre>
          <code>{`import type { RouteHandler } from "swift-rust/router";

export const GET: RouteHandler = async ({ request }) => {
  const posts = await db.posts.findMany();
  return Response.json(posts);
};`}</code>
        </pre>
      </div>

      <h2>A POST handler with body parsing</h2>
      <div className="code-block">
        <div className="code-block-header">
          <span>app/api/posts/route.ts</span>
        </div>
        <pre>
          <code>{`import type { RouteHandler } from "swift-rust/router";

export const POST: RouteHandler = async ({ request }) => {
  const body = await request.json();
  const post = await db.posts.create({ data: body });
  return Response.json(post, { status: 201 });
};`}</code>
        </pre>
      </div>

      <h2>Dynamic API routes</h2>
      <p>
        Use the same <code>[param]</code> syntax as pages.
      </p>
      <div className="code-block">
        <div className="code-block-header">
          <span>app/api/posts/[id]/route.ts</span>
        </div>
        <pre>
          <code>{`import type { RouteHandler } from "swift-rust/router";

export const GET: RouteHandler = async ({ params }) => {
  const post = await db.posts.findUnique({ where: { id: params.id } });
  if (!post) return new Response("Not found", { status: 404 });
  return Response.json(post);
};`}</code>
        </pre>
      </div>

      <h2>Cookies and headers</h2>
      <p>
        <code>request</code> is a standard Fetch <code>Request</code>, so read cookies and headers
        from <code>request.headers</code>.
      </p>
      <div className="code-block">
        <div className="code-block-header">
          <span>usage</span>
        </div>
        <pre>
          <code>{`export const POST: RouteHandler = async ({ request }) => {
  const session = request.headers.get("cookie")?.match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!session) return new Response("Unauthorized", { status: 401 });
  return Response.json({ ok: true });
};`}</code>
        </pre>
      </div>

      <h2>Custom responses</h2>
      <p>
        Return any standard <code>Response</code> object. The framework passes it through unchanged.
        For PDFs, use <code>Response.pdf(tree)</code>.
      </p>

      <h2>Deploying</h2>
      <p>
        <code>swift-rust build</code> bundles every API route. On Multivrs they run in{" "}
        <code>dist/server.mjs</code> and are listed in <code>multivrs-build.json</code>. On Vercel
        they run in one function at <code>/_swift-rust/endpoints</code>. In production, an error
        thrown by a handler returns <code>{'{"error":"Internal error"}'}</code> with status 500; the
        real error is logged and passed to <code>onRequestError</code> in{" "}
        <code>instrumentation.ts</code>.
      </p>
    </DocArticle>
  );
}
