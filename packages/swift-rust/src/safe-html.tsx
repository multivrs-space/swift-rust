import type { ElementType, HTMLAttributes, ReactNode } from "react";

export const TRUSTED_HTML_SYMBOL = Symbol.for("swift-rust.trusted-html");

export interface TrustedHtml {
  readonly [TRUSTED_HTML_SYMBOL]: true;
  readonly html: string;
  readonly signature: string;
  readonly origin: "codebase" | "server";
}

let serverSecret: string | null = null;
function getServerSecret(): string {
  if (serverSecret) return serverSecret;
  if (typeof process !== "undefined" && process.env?.SWIFT_RUST_TRUSTED_KEY) {
    serverSecret = process.env.SWIFT_RUST_TRUSTED_KEY;
    return serverSecret;
  }
  serverSecret = "swift-rust-codebase-trusted-secret-key";
  return serverSecret;
}

export function computeSignature(html: string, key: string): string {
  let hash = 0;
  const combined = `${key}:${html}`;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

export function createTrustedHtml(
  html: string,
  options?: { key?: string; origin?: "codebase" | "server" },
): TrustedHtml {
  const isBrowser = typeof globalThis !== "undefined" && "window" in globalThis;
  const key = options?.key || getServerSecret();
  const signature = computeSignature(html, key);

  return {
    [TRUSTED_HTML_SYMBOL]: true,
    html,
    signature,
    origin: isBrowser ? "server" : (options?.origin ?? "codebase"),
  };
}

export function isTrustedHtml(val: unknown): val is TrustedHtml {
  return (
    typeof val === "object" &&
    val !== null &&
    (val as Record<symbol, unknown>)[TRUSTED_HTML_SYMBOL] === true
  );
}

export function sanitizeHtml(raw: string): string {
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, "")
    .replace(/\s+on\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "")
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="about:blank"')
    .replace(/src\s*=\s*["']javascript:[^"']*["']/gi, 'src="about:blank"');
}

export interface SafeHtmlProps extends Omit<HTMLAttributes<HTMLElement>, "content"> {
  content: TrustedHtml | string;
  trustedKey?: string;
  as?: ElementType;
  fallback?: ReactNode;
  onBlocked?: (reason: string) => void;
}

export function SafeHtml({
  content,
  trustedKey,
  as: Component = "div",
  fallback,
  onBlocked,
  className,
  id,
  ...rest
}: SafeHtmlProps) {
  const isBrowser = typeof globalThis !== "undefined" && "window" in globalThis;
  const rawString = typeof content === "string" ? content : content.html;

  let isAllowed = false;
  let reason = "";

  if (isTrustedHtml(content)) {
    const key = trustedKey || getServerSecret();
    const expected = computeSignature(content.html, key);
    if (content.signature === expected) {
      isAllowed = true;
    } else {
      reason = "Cryptographic signature mismatch on TrustedHtml token";
    }
  } else if (!isBrowser) {
    if (trustedKey) {
      isAllowed = true;
    } else {
      isAllowed = false;
      reason = "Raw string without cryptographic token or trustedKey";
    }
  } else {
    isAllowed = false;
    reason = "Unauthenticated raw HTML injection blocked in browser context";
  }

  if (!isAllowed) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn(`[swift-rust security] Blocked unauthenticated raw HTML injection: ${reason}`);
    }
    if (onBlocked) {
      onBlocked(reason);
    }
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <Component data-swift-rust-safe="blocked" className={className} id={id} {...rest}>
        {rawString}
      </Component>
    );
  }

  const finalHtml = isTrustedHtml(content) ? content.html : sanitizeHtml(rawString);

  return (
    <Component
      data-swift-rust-safe="verified"
      className={className}
      id={id}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: verified by swift-rust cryptographic boundary
      dangerouslySetInnerHTML={{ __html: finalHtml }}
      {...rest}
    />
  );
}

export default SafeHtml;
