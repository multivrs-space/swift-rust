import "./globals.css";
import type { ReactNode } from "react";
import { Geist, GeistMono } from "swift-rust/font/google";
import { Analytics } from "./components/analytics";
import { CodeCopyButtons } from "./components/code-copy-buttons";
import { Header } from "./components/header";
import { Sidebar } from "./components/sidebar";

const geist = Geist({ subsets: ["latin"], display: "swap", variable: true });
const geistMono = GeistMono({ subsets: ["latin"], display: "swap", variable: true });

export const metadata = {
  title: {
    template: "%s · Swift Rust",
    default: "Swift Rust — The React framework powered with Rust + Bun",
  },
  description:
    "Swift Rust is a full-stack React framework powered with Rust + Bun. TSX, server rendering, WASM hydration, Image/Font/Pdf/Video components, 10x faster than Next.js, single-binary deploy.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${geist.className} ${geistMono.className}`.trim()}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <CodeCopyButtons />
        <Header />
        <div className="docs-shell">
          <Sidebar />
          <main className="docs-main">{children}</main>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
