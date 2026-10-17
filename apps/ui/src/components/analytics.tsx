import { Script } from "swift-rust";

export function Analytics() {
  return (
    <>
      <Script id="vercel-analytics-init" strategy="beforeInteractive">
        {
          "window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };"
        }
      </Script>
      <Script defer src="/_vercel/insights/script.js" strategy="afterInteractive" />
    </>
  );
}
