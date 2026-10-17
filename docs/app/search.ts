import { NAV } from "./navigation";

export interface FrameworkSearchItem {
  title: string;
  href: string;
  section: string;
  description: string;
  keywords: string;
}

const DESCRIPTIONS: Record<string, string> = {
  "/docs": "Start building applications with the Swift Rust framework.",
  "/docs/getting-started/installation": "Install Swift Rust and create your first application.",
  "/docs/getting-started/project-structure": "Understand application folders and project files.",
  "/docs/getting-started/layouts-and-pages": "Build layouts, pages, and nested route UI.",
  "/docs/getting-started/rendering-modes": "Choose SSR, WASM, HTMX, or hybrid rendering.",
  "/docs/getting-started/data-fetching": "Load data on the server and in route components.",
  "/docs/getting-started/styling": "Style applications with CSS and Tailwind.",
  "/docs/getting-started/fonts": "Load Google and local fonts.",
  "/docs/getting-started/images": "Optimize and render responsive images.",
  "/docs/getting-started/videos": "Render HTML5, YouTube, and Vimeo video.",
  "/docs/getting-started/pdfs": "Display and generate PDF documents.",
  "/docs/getting-started/deploying": "Build and deploy Swift Rust applications.",
  "/docs/routing/file-conventions": "Learn route files, params, schemas, loaders, and actions.",
  "/docs/guides/auth": "Add authentication and protect application routes.",
  "/docs/guides/forms": "Handle forms, validation, and server actions.",
  "/docs/guides/server-actions": "Execute server mutations and RPC from forms and client components.",
  "/docs/guides/caching-and-ppr": "Partial Prerendering, 'use cache', and on-demand revalidation.",
  "/docs/guides/api-routes": "Create JSON APIs and route handlers.",
  "/docs/guides/metadata": "Configure page metadata, Open Graph, and SEO.",
  "/docs/guides/error-handling": "Handle route errors and recovery boundaries.",
  "/docs/guides/migrating-from-nextjs": "Move a Next.js application to Swift Rust.",
  "/docs/guides/single-binary-deploy": "Ship the framework as a single Rust binary.",
  "/docs/api-reference/components/safe-html": "Cryptographically secure HTML boundary and XSS protection.",
  "/docs/api-reference/components/script": "API reference for optimized script loading strategies.",
  "/docs/api-reference/components/image": "API reference for the Image component.",
  "/docs/api-reference/components/font": "API reference for Google and local font helpers.",
  "/docs/api-reference/components/video": "API reference for the Video component.",
  "/docs/api-reference/components/pdf": "API reference for PDF components.",
  "/docs/api-reference/components/link": "API reference for client navigation links.",
  "/docs/api-reference/components/head": "API reference for Head and metadata.",
  "/docs/api-reference/hooks": "API reference for router and request hooks.",
  "/docs/api-reference/config": "Configure rendering, build, and application behavior.",
  "/docs/api-reference/router": "API reference for navigation and route state.",
  "/docs/api-reference/errors": "Framework error codes and diagnostics.",
  "/docs/api-reference/cli": "CLI commands for development, builds, and production.",
};

const DOC_ITEMS: FrameworkSearchItem[] = NAV.flatMap((section) =>
  section.items.map((item) => ({
    title: item.label,
    href: item.href,
    section: section.title,
    description: DESCRIPTIONS[item.href] ?? `${item.label} documentation for Swift Rust.`,
    keywords: `${section.title} ${item.href.replaceAll("/", " ").replaceAll("-", " ")}`,
  })),
);

const SHOWCASE_ITEMS: FrameworkSearchItem[] = [
  {
    title: "Font browser",
    href: "/fonts",
    section: "Components",
    description: "Preview Google and bundled local fonts live.",
    keywords: "typography gallery font preview",
  },
  {
    title: "Image component",
    href: "/components/image",
    section: "Components",
    description: "Explore responsive image optimization.",
    keywords: "picture responsive optimizer",
  },
  {
    title: "Font component",
    href: "/components/font",
    section: "Components",
    description: "Explore framework font loading.",
    keywords: "google local typography",
  },
  {
    title: "PDF component",
    href: "/components/pdf",
    section: "Components",
    description: "Explore PDF rendering primitives.",
    keywords: "document viewer",
  },
  {
    title: "Video examples",
    href: "/videos",
    section: "Components",
    description: "Preview supported video modes.",
    keywords: "youtube vimeo html5 lightbox",
  },
];

export const FRAMEWORK_SEARCH_ITEMS = [...DOC_ITEMS, ...SHOWCASE_ITEMS];

function matchScore(item: FrameworkSearchItem, query: string): number {
  const title = item.title.toLowerCase();
  const section = item.section.toLowerCase();
  const description = item.description.toLowerCase();
  const keywords = item.keywords.toLowerCase();
  if (title === query) return 0;
  if (title.startsWith(query)) return 1;
  if (title.includes(query)) return 2;
  if (section.includes(query)) return 3;
  if (keywords.includes(query)) return 4;
  if (description.includes(query)) return 5;
  return Number.POSITIVE_INFINITY;
}

export function searchFrameworkDocs(query: string): FrameworkSearchItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return FRAMEWORK_SEARCH_ITEMS.slice(0, 8);
  return FRAMEWORK_SEARCH_ITEMS.map((item) => ({
    item,
    score: matchScore(item, normalized),
  }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => a.score - b.score || a.item.title.localeCompare(b.item.title))
    .map(({ item }) => item);
}
