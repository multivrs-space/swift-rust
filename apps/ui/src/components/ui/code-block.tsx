"use client";
import * as React from "react";
import { SafeHtml, createTrustedHtml } from "swift-rust";
import { cn } from "@/lib/utils";

export interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
  className?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const KEYWORDS =
  /\b(import|export|from|default|function|return|const|let|var|type|interface|extends|implements|new|await|async|if|else|for|while|switch|case|break|class|public|private|readonly|as)\b/g;

// Highlight a single (already-trusted, dev-authored) line. Order matters:
// numbers run before any markup is injected so digit-bearing class names
// (e.g. text-sky-400) are never re-matched.
function highlightSegment(code: string): string {
  let e = escapeHtml(code);
  e = e.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="text-amber-400">$1</span>');
  e = e.replace(KEYWORDS, '<span class="text-fuchsia-400">$1</span>');
  e = e.replace(/(&lt;\/?)([A-Za-z][\w.]*)/g, '$1<span class="text-sky-400">$2</span>');
  return e;
}

function highlightLine(line: string): string {
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: scanner loop
  while ((m = re.exec(line)) !== null) {
    out += highlightSegment(line.slice(last, m.index));
    if (m[1]) out += `<span class="text-zinc-500">${escapeHtml(m[1])}</span>`;
    else out += `<span class="text-emerald-400">${escapeHtml(m[2] ?? "")}</span>`;
    last = re.lastIndex;
  }
  out += highlightSegment(line.slice(last));
  return out;
}

export function CodeBlock({
  code,
  language,
  filename,
  showLineNumbers = true,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);
  const lines = code.replace(/\n$/, "").split("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-[#0b0b0e] text-zinc-100", className)}>
      {(filename || language) && (
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
          <span className="font-mono text-xs text-zinc-400">{filename ?? language}</span>
          <CopyButton copied={copied} onCopy={copy} />
        </div>
      )}
      <div className="relative">
        {!filename && !language && (
          <div className="absolute right-2 top-2 z-10">
            <CopyButton copied={copied} onCopy={copy} subtle />
          </div>
        )}
        <div className="overflow-x-auto">
          <pre className="py-3 font-mono text-[0.8rem] leading-relaxed">
            {lines.map((line, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className="flex px-4">
                {showLineNumbers && (
                  <span className="mr-4 w-6 shrink-0 select-none text-right text-zinc-600">{i + 1}</span>
                )}
                <SafeHtml
                  as="code"
                  className="whitespace-pre"
                  content={createTrustedHtml(highlightLine(line) || "&nbsp;")}
                />
              </div>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}

function CopyButton({ copied, onCopy, subtle }: { copied: boolean; onCopy: () => void; subtle?: boolean }) {
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label="Copy code"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100",
        subtle && "bg-white/5",
      )}
    >
      {copied ? (
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
      )}
    </button>
  );
}
