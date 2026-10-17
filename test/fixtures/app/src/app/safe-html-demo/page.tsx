import { SafeHtml, createTrustedHtml } from "swift-rust";

export default function SafeHtmlDemoPage() {
  const trusted = createTrustedHtml("<section id=\"trusted-zone\"><h2>Verified Codebase HTML</h2></section>");
  const untrusted = "<script>alert('xss-attempt')</script><p>Untrusted Payload</p>";

  return (
    <div>
      <h1>SafeHtml Demo</h1>
      <SafeHtml id="verified-box" content={trusted} />
      <SafeHtml id="blocked-box" content={untrusted} />
    </div>
  );
}
