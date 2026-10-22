import { npmDownloadStats } from "@/lib/npm-downloads";

function count(n: number): string {
  return n.toLocaleString("en-US");
}

export async function NpmDownloads() {
  const stats = await npmDownloadStats("swift-rust");
  if (!stats) return null;

  return (
    <a
      href="https://www.npmjs.com/package/swift-rust"
      target="_blank"
      rel="noreferrer"
      className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[0.8125rem] text-fg-muted hover:text-fg"
    >
      <span>
        <span className="font-semibold text-fg">{count(stats.total)}</span> total downloads
      </span>
      <span className="text-fg-subtle" aria-hidden>
        ·
      </span>
      <span>
        <span className="font-semibold text-fg">{count(stats.week)}</span> this week
      </span>
    </a>
  );
}
