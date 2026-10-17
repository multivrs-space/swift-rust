import { DocArticle } from "@/app/components/doc-article";

export const metadata = { title: "Script component" };

export default function ScriptDocPage() {
  return (
    <DocArticle>
      <h1>Script</h1>
      <p>
        The <code>&lt;Script&gt;</code> component manages third-party scripts, analytics, and inline
        scripts with priority loading strategies.
      </p>

      <h2>Import</h2>
      <div className="code-block">
        <div className="code-block-header">
          <span>usage</span>
        </div>
        <pre>
          <code>{`import { Script } from "swift-rust";`}</code>
        </pre>
      </div>

      <h2>Loading Strategies</h2>
      <ul>
        <li>
          <code>afterInteractive</code> (default) — Injected right after the page becomes
          interactive. Suitable for tag managers, analytics, and chat widgets.
        </li>
        <li>
          <code>beforeInteractive</code> — Injected into the initial HTML document shell before any
          application code hydrates. Suitable for bot detection, consent banners, and polyfills.
        </li>
        <li>
          <code>lazyOnload</code> — Loaded during idle browser network time (via{" "}
          <code>requestIdleCallback</code>). Ideal for non-critical social embeds and widgets.
        </li>
        <li>
          <code>worker</code> — Offloads script execution to a web worker to preserve the main
          thread.
        </li>
      </ul>

      <h2>Examples</h2>

      <div className="code-block">
        <div className="code-block-header">
          <span>app/layout.tsx</span>
        </div>
        <pre>
          <code>{`import { Script } from "swift-rust";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=GA_TRACKING_ID"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {\`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'GA_TRACKING_ID');
          \`}
        </Script>
      </body>
    </html>
  );
}`}</code>
        </pre>
      </div>
    </DocArticle>
  );
}
