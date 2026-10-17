import type { ScriptHTMLAttributes } from "react";

export type ScriptStrategy = "beforeInteractive" | "afterInteractive" | "lazyOnload" | "worker";

export interface ScriptProps
  extends Omit<ScriptHTMLAttributes<HTMLScriptElement>, "dangerouslySetInnerHTML"> {
  strategy?: ScriptStrategy;
  id?: string;
  onLoad?: () => void;
  onReady?: () => void;
  onError?: () => void;
  children?: string;
  dangerouslySetInnerHTML?: { __html: string };
}

export function Script({
  strategy = "afterInteractive",
  id,
  children,
  dangerouslySetInnerHTML,
  ...rest
}: ScriptProps) {
  const dataAttrs: Record<string, string> = {
    "data-strategy": strategy,
  };
  if (id) dataAttrs.id = id;

  if (dangerouslySetInnerHTML) {
    // biome-ignore lint/security/noDangerouslySetInnerHtml: inline script execution
    return <script {...dataAttrs} {...rest} dangerouslySetInnerHTML={dangerouslySetInnerHTML} />;
  }

  if (children && typeof children === "string") {
    // biome-ignore lint/security/noDangerouslySetInnerHtml: inline script execution
    return <script {...dataAttrs} {...rest} dangerouslySetInnerHTML={{ __html: children }} />;
  }

  return <script {...dataAttrs} {...rest} />;
}

export default Script;
