import { BLUR } from "@/lib/blur";
import type { Metadata } from "swift-rust";
import Image from "swift-rust/image";

export const metadata: Metadata = {
  title: "Images",
  description:
    "Automatic AVIF/WebP negotiation, responsive srcsets, and zero-CLS blur placeholders powered by swift-rust/image.",
};

const IMAGES = [
  {
    src: "/samples/axelborg-towers-modern-architecture.jpg",
    alt: "Modern architecture towers",
    w: 3456,
    h: 2635,
    label: "4:3 · AVIF",
    savings: "-76% payload",
  },
  {
    src: "/samples/full-shot-woman-taking-selfie.jpg",
    alt: "Woman taking a selfie",
    w: 5327,
    h: 7990,
    label: "2:3 · AVIF",
    savings: "-72% payload",
  },
  {
    src: "/samples/metaverse-concept-collage-design.jpg",
    alt: "Metaverse concept collage",
    w: 6000,
    h: 4000,
    label: "3:2 · AVIF",
    savings: "-69% payload",
  },
  {
    src: "/samples/happy-black-parents-with-kids-making-video-call-smart-phone-home.jpg",
    alt: "Family on a video call at home",
    w: 6000,
    h: 4000,
    label: "3:2 · AVIF",
    savings: "-74% payload",
  },
  {
    src: "/samples/brown-high-skyscrapers.jpg",
    alt: "Tall brown skyscrapers",
    w: 4000,
    h: 5000,
    label: "4:5 · AVIF",
    savings: "-78% payload",
  },
  {
    src: "/samples/close-up-portrait-gorgeous-young-woman.jpg",
    alt: "Close-up portrait of a young woman",
    w: 8494,
    h: 5663,
    label: "3:2 · AVIF",
    savings: "-71% payload",
  },
];

export default function ImagesPage() {
  return (
    <div className="container-page py-14 sm:py-20">
      <header className="grid gap-6 border-b border-border pb-10 lg:grid-cols-[1.15fr_1fr] lg:items-end">
        <div>
          <span className="badge badge-accent font-mono">swift-rust/image</span>
          <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-fg sm:text-5xl">
            Zero-CLS Image Optimization.
          </h1>
          <p className="mt-4 max-w-2xl text-[1rem] leading-relaxed text-fg-muted">
            The <code className="font-mono text-fg">&lt;Image /&gt;</code> primitive negotiates AVIF
            and WebP formats on the fly in Rust, emits responsive{" "}
            <code className="font-mono text-fg">srcset</code> descriptors, and locks aspect ratios
            with instant blur placeholders.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-xs">
          <div className="flex items-center justify-between border-b border-border bg-bg px-4 py-2 font-mono text-[0.72rem] text-fg-subtle">
            <span>src/app/images/page.tsx</span>
            <span className="text-success">CLS: 0.00</span>
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-[0.75rem] leading-relaxed text-fg">
            <code>{`import Image from "swift-rust/image";

<Image
  src="/samples/axelborg-towers.jpg"
  alt="Modern architecture"
  width={3456}
  height={2635}
  placeholder="blur"
  blurDataURL={BLUR}
/>`}</code>
          </pre>
        </div>
      </header>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {IMAGES.map((img) => (
          <figure
            key={img.src}
            className="group overflow-hidden rounded-2xl border border-border bg-surface shadow-xs transition-all hover:border-border-strong hover:shadow-md"
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-surface-2">
              <Image
                src={img.src}
                alt={img.alt}
                width={img.w}
                height={img.h}
                placeholder="blur"
                blurDataURL={BLUR}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <figcaption className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-[0.8125rem]">
              <span className="min-w-0 truncate font-mono text-[0.75rem] text-fg-muted">
                {img.src.split("/").pop()}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="badge badge-success font-mono text-[0.68rem]">{img.savings}</span>
                <span className="badge font-mono text-[0.68rem]">{img.label}</span>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
