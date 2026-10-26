import type { ReactNode } from "react";
import "./globals.css";
import { Analytics } from "@/components/analytics";
import { LiveVersionScript } from "@/components/live-version";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { siteConfig } from "@/lib/site.config";
import { Geist, GeistMono, PlusJakartaSans } from "swift-rust/font/google";

const OG_IMAGE = `${siteConfig.url}/og-image.png`;

const plusJakarta = PlusJakartaSans({ variable: true, subsets: ["latin"] });
const geist = Geist({ variable: true, subsets: ["latin"] });
const geistMono = GeistMono({ variable: true, subsets: ["latin"] });

export const metadata = {
  title: {
    template: "%s | Swift Rust",
    default: "Swift Rust — The React Framework for the Rust Era",
  },
  description:
    "Swift Rust is a Next.js-compatible full-stack React 19 framework powered with Rust + Bun. Streaming SSR, Server Actions, four rendering modes, 19.6x faster SSR than Next.js, and single-binary deployment.",
  openGraph: {
    title: "Swift Rust — The React Framework for the Rust Era",
    description:
      "React 19 Server Components, streaming SSR, four rendering modes, and single-binary deployment powered with Rust + Bun.",
    type: "website",
    url: siteConfig.url,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "Swift Rust" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Swift Rust — The React Framework for the Rust Era",
    description:
      "React 19 Server Components, streaming SSR, four rendering modes, and single-binary deployment powered with Rust + Bun.",
    images: [OG_IMAGE],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const htmlClasses = [
    plusJakarta.variable ?? "",
    geist.variable ?? "",
    geistMono.variable ?? "",
    plusJakarta.className,
    geist.className,
    geistMono.className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <html
      lang="en"
      className={htmlClasses}
      style={{
        ["--font-display" as string]: "'Plus Jakarta Sans', 'Geist', system-ui, sans-serif",
        ["--font-sans" as string]: "'Geist', system-ui, sans-serif",
        ["--font-mono" as string]: "'Geist Mono', ui-monospace, monospace",
      }}
    >
      <body className="min-h-screen bg-bg font-sans text-fg antialiased">
        <Nav />
        <main className="min-h-[calc(100vh-4.25rem)]">{children}</main>
        <Footer />
        <Analytics />
        <LiveVersionScript />
      </body>
    </html>
  );
}
