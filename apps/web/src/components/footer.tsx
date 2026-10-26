import { siteConfig } from "@/lib/site.config";
import { Link } from "swift-rust";
import { Logo } from "./logo";
import { Version } from "@/components/live-version";

const COLUMNS: Array<{
  title: string;
  links: Array<{ href: string; label: string; external?: boolean }>;
}> = [
  {
    title: "Product",
    links: [
      { href: "/", label: "Overview" },
      { href: "/images", label: "Image Optimizer" },
      { href: "/fonts", label: "Zero-FOUT Fonts" },
      { href: "/videos", label: "Streaming Video" },
      { href: siteConfig.uiUrl, label: "Swift Rust UI", external: true },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: siteConfig.docsUrl, label: "Documentation", external: true },
      { href: "/blog", label: "Engineering Blog" },
      { href: "/blog/introducing-swift-rust", label: "Benchmarks" },
      { href: siteConfig.issuesUrl, label: "Support & Issues", external: true },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/about/team", label: "Core Team" },
      { href: "/contact", label: "Contact" },
      { href: siteConfig.githubUrl, label: "Open Source", external: true },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-20 overflow-hidden pt-4 pb-8">
      <div className="container-page relative z-10">
        <div className="rounded-[2rem] border border-border bg-surface p-8 shadow-[0_18px_50px_-14px_rgb(10_10_10/0.07)] sm:p-12 lg:p-14">
          <div className="grid gap-12 lg:grid-cols-[1.2fr_1.5fr] lg:items-start">
            <div className="min-w-0">
              <Logo />
              <p className="mt-4 max-w-sm text-[0.875rem] leading-relaxed text-fg-muted">
                Swift Rust empowers teams to build full-stack React applications with native Rust
                speed — making streaming SSR, Server Actions, and single-binary deploys effortless.
              </p>

              <div className="mt-6 flex items-center gap-3.5 text-fg">
                <a
                  href="https://x.com"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="X"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-fg transition-colors hover:bg-surface-2 hover:text-accent"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
                <a
                  href={siteConfig.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="GitHub"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-fg transition-colors hover:bg-surface-2 hover:text-accent"
                >
                  <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor" aria-hidden>
                    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.16-.02-2.11-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.05.78 2.12 0 1.53-.01 2.77-.01 3.14 0 .31.21.68.8.56C20.21 21.38 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
                  </svg>
                </a>
                <a
                  href="https://discord.gg/swift-rust"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Discord"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-fg transition-colors hover:bg-surface-2 hover:text-accent"
                >
                  <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor" aria-hidden>
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                </a>
                <a
                  href="https://www.npmjs.com/package/swift-rust"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="npm"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-fg transition-colors hover:bg-surface-2 hover:text-accent"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                    <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
                  </svg>
                </a>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:justify-items-end">
              {COLUMNS.map((col) => (
                <div key={col.title} className="min-w-0">
                  <h3 className="font-display text-[0.875rem] font-semibold text-fg">
                    {col.title}
                  </h3>
                  <ul className="mt-4 space-y-3">
                    {col.links.map((link) => (
                      <li key={link.href + link.label}>
                        {link.external ? (
                          <a
                            href={link.href}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[0.85rem] text-fg-muted transition-colors hover:text-fg"
                          >
                            {link.label}
                          </a>
                        ) : (
                          <Link
                            href={link.href}
                            className="text-[0.85rem] text-fg-muted transition-colors hover:text-fg"
                          >
                            {link.label}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-border pt-7 text-[0.8125rem] text-fg-subtle sm:flex-row sm:items-center">
            <p>© {year} Swift Rust. All rights reserved.</p>
            <div className="flex flex-wrap items-center gap-6">
              <a
                href={`${siteConfig.githubUrl}/blob/main/LICENSE`}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-border-strong underline-offset-4 transition-colors hover:text-fg"
              >
                MIT License
              </a>
              <a
                href={siteConfig.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-border-strong underline-offset-4 transition-colors hover:text-fg"
              >
                Documentation
              </a>
              <a
                href={`${siteConfig.githubUrl}/releases`}
                target="_blank"
                rel="noreferrer"
                className="font-mono underline decoration-border-strong underline-offset-4 transition-colors hover:text-fg"
              >
                v<Version />
              </a>
            </div>
          </div>
        </div>

        <div
          aria-hidden
          className="pointer-events-none -mt-4 select-none overflow-hidden text-center"
        >
          <span className="block bg-gradient-to-b from-stone-900/[0.065] via-stone-900/[0.025] to-transparent bg-clip-text font-display text-[17vw] font-extrabold leading-[0.84] tracking-tighter text-transparent sm:text-[13.5rem]">
            swift·rust
          </span>
        </div>
      </div>
    </footer>
  );
}
