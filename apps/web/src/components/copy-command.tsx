"use client";

import { useState } from "react";

export function CopyCommand({
  command,
  tone = "light",
}: {
  command: string;
  tone?: "light" | "dark";
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const fallback = () => {
      const field = document.createElement("textarea");
      field.value = command;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.left = "-9999px";
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand("copy");
      field.remove();
      return ok;
    };

    let wrote = false;
    if (navigator.clipboard?.writeText) {
      wrote = await Promise.race([
        navigator.clipboard.writeText(command).then(() => true, () => false),
        new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 250)),
      ]);
    }
    if (!wrote && !fallback()) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const light =
    "inline-flex h-[2.875rem] cursor-pointer items-center gap-2.5 rounded-full border border-border bg-surface px-4 font-mono text-[0.8125rem] text-fg-muted shadow-xs transition-colors hover:border-orange-300 hover:text-fg";
  const dark =
    "inline-flex h-11 cursor-pointer items-center gap-2.5 rounded-full border border-white/15 bg-white/5 px-4 font-mono text-[0.8125rem] text-stone-200 transition-colors hover:border-white/30 hover:bg-white/10";

  return (
    <button type="button" onClick={copy} className={tone === "dark" ? dark : light} aria-label={`Copy ${command}`}>
      {tone === "light" ? <span className="text-accent select-none">▲ ~</span> : <span className="text-stone-500 select-none">$</span>}
      <span className={tone === "dark" ? "text-stone-200" : "text-fg"}>{command}</span>
      <span className={tone === "dark" ? "text-stone-400" : "text-fg-subtle"} aria-hidden>
        {copied ? (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3.5 8.5 6.5 11.5 12.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
            <path d="M10.5 5.5V3.75A1.25 1.25 0 0 0 9.25 2.5h-5.5A1.25 1.25 0 0 0 2.5 3.75v5.5A1.25 1.25 0 0 0 3.75 10.5H5.5" />
          </svg>
        )}
      </span>
    </button>
  );
}
