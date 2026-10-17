import { siteConfig } from "@/lib/site.config";
import { Link } from "swift-rust";
import { useRouteRequest } from "swift-rust/router";
import { Logo } from "./logo";

const NAV = [
  { href: "/blog", label: "Blog" },
  { href: "/fonts", label: "Fonts" },
  { href: "/images", label: "Images" },
  { href: "/videos", label: "Videos" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.16-.02-2.11-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.05.78 2.12 0 1.53-.01 2.77-.01 3.14 0 .31.21.68.8.56C20.21 21.38 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
  </svg>
);

function isActivePath(pathname: string | undefined, href: string) {
  if (!pathname) return false;
  if (href === "/") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav() {
  const pathname = useRouteRequest()?.url.pathname;

  return (
    <header className="sticky top-4 z-40 px-4 sm:px-6">
      <input type="checkbox" id="site-menu" className="peer sr-only" aria-label="Toggle menu" />

      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between rounded-full border border-white/70 bg-white/65 px-3.5 shadow-[0_8px_32px_-6px_rgb(10_10_10/0.08),0_0_0_1px_rgb(10_10_10/0.05),inset_0_1px_0_0_rgb(255_255_255/0.85)] backdrop-blur-2xl backdrop-saturate-150 md:grid md:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center pl-1.5">
          <Link href="/" aria-label="Swift Rust Home" className="inline-flex items-center">
            <Logo />
          </Link>
        </div>

        <nav
          aria-label="Main navigation"
          className="hidden items-center justify-center gap-1 md:flex"
        >
          {NAV.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3.5 py-1.5 text-[0.84rem] font-medium transition-all ${
                  active
                    ? "bg-white/90 text-accent shadow-xs ring-1 ring-black/[0.04]"
                    : "text-fg-muted hover:bg-white/60 hover:text-fg"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center justify-end gap-2">
          <a
            href={siteConfig.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="hidden h-9 items-center justify-center gap-1.5 rounded-full border border-black/[0.08] bg-white/75 px-3.5 text-[0.8125rem] font-medium text-fg shadow-2xs transition-all hover:bg-white sm:inline-flex"
          >
            <GitHubIcon />
            <span>GitHub</span>
          </a>
          <a
            href={siteConfig.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-accent h-9 rounded-full px-4 text-[0.8125rem] font-semibold"
          >
            <span>Get Started</span>
          </a>

          <label
            htmlFor="site-menu"
            aria-label="Toggle navigation menu"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-black/[0.08] bg-white/75 text-fg md:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 peer-checked:hidden"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          </label>
        </div>
      </div>

      <nav
        aria-label="Mobile navigation"
        className="mx-auto mt-2 hidden max-w-5xl rounded-3xl border border-white/70 bg-white/85 p-4 shadow-lg ring-1 ring-black/[0.05] backdrop-blur-2xl peer-checked:block md:!hidden"
      >
        <div className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-4 py-2 text-[0.9rem] font-medium transition-colors ${
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-fg-muted hover:bg-surface-2 hover:text-fg"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <div className="mt-2 flex gap-2 border-t border-border pt-3">
            <a
              href={siteConfig.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline btn-sm flex-1 justify-center rounded-full"
            >
              <GitHubIcon />
              <span>GitHub</span>
            </a>
            <a
              href={siteConfig.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-accent btn-sm flex-1 justify-center rounded-full"
            >
              <span>Get Started</span>
            </a>
          </div>
        </div>
      </nav>
    </header>
  );
}
