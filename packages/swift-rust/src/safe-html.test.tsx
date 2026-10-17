import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createTrustedHtml,
  isTrustedHtml,
  SafeHtml,
  sanitizeHtml,
  TRUSTED_HTML_SYMBOL,
} from "./safe-html";

describe("SafeHtml and createTrustedHtml", () => {
  it("creates a cryptographically signed TrustedHtml token", () => {
    const raw = "<h1>Codebase Trusted Heading</h1>";
    const token = createTrustedHtml(raw);

    expect(isTrustedHtml(token)).toBe(true);
    expect(token[TRUSTED_HTML_SYMBOL]).toBe(true);
    expect(token.html).toBe(raw);
    expect(typeof token.signature).toBe("string");
    expect(token.signature.length).toBeGreaterThan(0);
  });

  it("identifies non-trusted values", () => {
    expect(isTrustedHtml(null)).toBe(false);
    expect(isTrustedHtml("<p>string</p>")).toBe(false);
    expect(isTrustedHtml({ html: "<h1>fake</h1>" })).toBe(false);
  });

  it("sanitizes dangerous HTML tags and event handlers", () => {
    const malicious =
      '<div onclick="steal()">Click</div><script>fetch("/keys")</script><a href="javascript:alert(1)">Link</a>';
    const sanitized = sanitizeHtml(malicious);

    expect(sanitized).not.toContain("<script>");
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).toContain("about:blank");
    expect(sanitized).toContain("Click");
  });

  it("renders verified trusted HTML", () => {
    const trusted = createTrustedHtml("<article><h2>Article Title</h2></article>");
    const html = renderToStaticMarkup(<SafeHtml content={trusted} />);

    expect(html).toContain('data-swift-rust-safe="verified"');
    expect(html).toContain("<h2>Article Title</h2>");
  });

  it("blocks unauthenticated raw strings and escapes text", () => {
    const malicious = "<script>alert('xss')</script><b>Bold</b>";
    let blockedReason = "";

    const html = renderToStaticMarkup(
      <SafeHtml
        content={malicious}
        onBlocked={(reason) => {
          blockedReason = reason;
        }}
      />,
    );

    expect(html).toContain('data-swift-rust-safe="blocked"');
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;");
    expect(blockedReason.length).toBeGreaterThan(0);
  });

  it("renders custom fallback when blocked", () => {
    const malicious = "<img src=x onerror=alert(1)>";
    const html = renderToStaticMarkup(
      <SafeHtml
        content={malicious}
        fallback={<div className="security-notice">Blocked Insecure HTML</div>}
      />,
    );

    expect(html).toContain('<div class="security-notice">Blocked Insecure HTML</div>');
    expect(html).not.toContain("<img");
  });

  it("allows rendering with an explicit trustedKey", () => {
    const secretKey = "my-custom-deploy-key";
    const content = "<p>Key verified content</p>";
    const html = renderToStaticMarkup(<SafeHtml content={content} trustedKey={secretKey} />);

    expect(html).toContain('data-swift-rust-safe="verified"');
    expect(html).toContain("<p>Key verified content</p>");
  });
});
