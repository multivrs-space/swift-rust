import { DocArticle } from "@/app/components/doc-article";

export const metadata = { title: "SafeHtml component" };

export default function SafeHtmlDocPage() {
  return (
    <DocArticle>
      <h1>SafeHtml</h1>
      <p>
        The <code>&lt;SafeHtml&gt;</code> component replaces React&apos;s insecure{" "}
        <code>dangerouslySetInnerHTML</code> with a cryptographically verified execution boundary.
        It permits raw HTML from your codebase or server, while blocking unauthenticated raw HTML
        injections originating from the browser.
      </p>

      <h2>Import</h2>
      <div className="code-block">
        <div className="code-block-header">
          <span>usage</span>
        </div>
        <pre>
          <code>{`import { SafeHtml, createTrustedHtml } from "swift-rust";`}</code>
        </pre>
      </div>

      <h2>How It Works</h2>
      <p>
        Unlike Next.js which accepts arbitrary unverified strings that can lead to Cross-Site
        Scripting (XSS), Swift Rust establishes a strict cryptographic origin policy:
      </p>
      <ul>
        <li>
          <strong>Codebase & Server Origin:</strong> HTML authored in server components or backend
          code is signed with <code>createTrustedHtml(rawHtml)</code>. This derives an HMAC/BLAKE3
          token using the server&apos;s runtime secret.
        </li>
        <li>
          <strong>Browser Origin Blocking:</strong> When running in the browser, any raw string or
          unsigned object passed to <code>&lt;SafeHtml&gt;</code> is automatically blocked from DOM
          injection. The content is safely escaped as text or replaced with your fallback UI.
        </li>
        <li>
          <strong>Server-side Sanitization:</strong> Any untrusted third-party strings rendered on
          the server (e.g. from a CMS) are automatically stripped of dangerous{" "}
          <code>&lt;script&gt;</code> tags, iframes, and <code>onerror=</code> event handlers.
        </li>
      </ul>

      <h2>Examples</h2>

      <h3>1. Server Component (Trusted Codebase Content)</h3>
      <div className="code-block">
        <div className="code-block-header">
          <span>app/blog/[slug]/page.tsx</span>
        </div>
        <pre>
          <code>{`import { SafeHtml, createTrustedHtml } from "swift-rust";

export default async function BlogPost({ params }: { params: { slug: string } }) {
  const post = await fetchPost(params.slug);
  
  // Cryptographically signs the HTML for safe rendering
  const trustedContent = createTrustedHtml(post.renderedBody);

  return (
    <article className="prose">
      <SafeHtml content={trustedContent} />
    </article>
  );
}`}</code>
        </pre>
      </div>

      <h3>2. Browser Attack Protection</h3>
      <div className="code-block">
        <div className="code-block-header">
          <span>app/search/page.tsx</span>
        </div>
        <pre>
          <code>{`"use client";
import { SafeHtml } from "swift-rust";

export default function SearchPage({ searchParams }: { searchParams: { q: string } }) {
  // If an attacker attempts query injection: ?q=<script>steal()</script>
  // SafeHtml detects browser execution without a server token and BLOCKS it.
  return (
    <div>
      <SafeHtml 
        content={searchParams.q}
        fallback={<p className="text-muted">Unauthenticated HTML was blocked.</p>}
      />
    </div>
  );
}`}</code>
        </pre>
      </div>

      <h2>Props</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                padding: "0.5rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              Prop
            </th>
            <th
              style={{
                textAlign: "left",
                padding: "0.5rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              Type
            </th>
            <th
              style={{
                textAlign: "left",
                padding: "0.5rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              Default
            </th>
            <th
              style={{
                textAlign: "left",
                padding: "0.5rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
              <code>content</code>
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
              <code>TrustedHtml | string</code>
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>required</td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
              Signed TrustedHtml token or sanitized string.
            </td>
          </tr>
          <tr>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
              <code>trustedKey</code>
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
              <code>string</code>
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
              process key
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
              Optional explicit verification secret key.
            </td>
          </tr>
          <tr>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
              <code>as</code>
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
              <code>ElementType</code>
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
              <code>&quot;div&quot;</code>
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
              Wrapper HTML tag or component.
            </td>
          </tr>
          <tr>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
              <code>fallback</code>
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
              <code>ReactNode</code>
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
              escaped text
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
              UI rendered when unauthenticated HTML is blocked.
            </td>
          </tr>
          <tr>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
              <code>onBlocked</code>
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
              <code>(reason: string) =&gt; void</code>
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
              undefined
            </td>
            <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
              Callback invoked when an unauthenticated injection is blocked.
            </td>
          </tr>
        </tbody>
      </table>
    </DocArticle>
  );
}
