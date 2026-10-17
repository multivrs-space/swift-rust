import { SafeHtml, createTrustedHtml, type Metadata } from "swift-rust";
import { localFontCss } from "swift-rust/font";
import {
  DxSlight,
  DxSlightExtBdUltraSlant,
  DxSlightMediumUltra,
  Lausanne,
  VarentGrotesk,
  VarentGroteskBold,
  VarentGroteskExtLtIta,
  Zimula,
} from "swift-rust/font";
import {
  BebasNeue,
  BricolageGrotesque,
  Caveat,
  Cinzel,
  DmSans,
  DmSerifDisplay,
  Figtree,
  FiraCode,
  Geist,
  GeistMono,
  IbmPlexMono,
  IbmPlexSans,
  IbmPlexSerif,
  Inter,
  JetbrainsMono,
  Lora,
  Manrope,
  Outfit,
  PlayfairDisplay,
  PlusJakartaSans,
  Poppins,
  Roboto,
  Sora,
  SourceCodePro,
  SpaceGrotesk,
} from "swift-rust/font/google";
import { FontStudio } from "@/components/font-studio";

export const metadata: Metadata = { title: "Fonts" };

type Factory = (opts?: { variable?: boolean }) => {
  className: string;
  style: Record<string, string>;
  variable?: string;
};

type FeaturedFont = {
  name: string;
  importName: string;
  factory: Factory;
  category: "Sans" | "Serif" | "Mono" | "Display" | "Script";
  blurb: string;
};

const FEATURED: FeaturedFont[] = [
  { name: "Geist", importName: "Geist", factory: Geist as Factory, category: "Sans", blurb: "Default UI sans, by Vercel" },
  { name: "Geist Mono", importName: "GeistMono", factory: GeistMono as Factory, category: "Mono", blurb: "Default monospace, by Vercel" },
  { name: "Inter", importName: "Inter", factory: Inter as Factory, category: "Sans", blurb: "Designed for screens" },
  { name: "Roboto", importName: "Roboto", factory: Roboto as Factory, category: "Sans", blurb: "Modern, friendly, versatile" },
  { name: "Poppins", importName: "Poppins", factory: Poppins as Factory, category: "Sans", blurb: "Geometric, warm heart" },
  { name: "Manrope", importName: "Manrope", factory: Manrope as Factory, category: "Sans", blurb: "Clean for editorial" },
  { name: "IBM Plex Sans", importName: "IbmPlexSans", factory: IbmPlexSans as Factory, category: "Sans", blurb: "Corporate with character" },
  { name: "Space Grotesk", importName: "SpaceGrotesk", factory: SpaceGrotesk as Factory, category: "Sans", blurb: "Quirky display" },
  { name: "Plus Jakarta Sans", importName: "PlusJakartaSans", factory: PlusJakartaSans as Factory, category: "Sans", blurb: "Elegant, modern" },
  { name: "Outfit", importName: "Outfit", factory: Outfit as Factory, category: "Sans", blurb: "Geometric branding" },
  { name: "Figtree", importName: "Figtree", factory: Figtree as Factory, category: "Sans", blurb: "Friendly, approachable" },
  { name: "Sora", importName: "Sora", factory: Sora as Factory, category: "Sans", blurb: "Made for UI" },
  { name: "DM Sans", importName: "DmSans", factory: DmSans as Factory, category: "Sans", blurb: "Low-contrast geometric" },
  { name: "Playfair Display", importName: "PlayfairDisplay", factory: PlayfairDisplay as Factory, category: "Serif", blurb: "Editorial elegance" },
  { name: "Lora", importName: "Lora", factory: Lora as Factory, category: "Serif", blurb: "Balanced for the screen" },
  { name: "DM Serif Display", importName: "DmSerifDisplay", factory: DmSerifDisplay as Factory, category: "Serif", blurb: "Editorial display" },
  { name: "IBM Plex Serif", importName: "IbmPlexSerif", factory: IbmPlexSerif as Factory, category: "Serif", blurb: "Corporate serif" },
  { name: "JetBrains Mono", importName: "JetbrainsMono", factory: JetbrainsMono as Factory, category: "Mono", blurb: "Code editor default" },
  { name: "Fira Code", importName: "FiraCode", factory: FiraCode as Factory, category: "Mono", blurb: "Monospace ligatures" },
  { name: "Source Code Pro", importName: "SourceCodePro", factory: SourceCodePro as Factory, category: "Mono", blurb: "Adobe monospace" },
  { name: "IBM Plex Mono", importName: "IbmPlexMono", factory: IbmPlexMono as Factory, category: "Mono", blurb: "Corporate mono" },
  { name: "Bricolage Grotesque", importName: "BricolageGrotesque", factory: BricolageGrotesque as Factory, category: "Display", blurb: "Bold contemporary" },
  { name: "Bebas Neue", importName: "BebasNeue", factory: BebasNeue as Factory, category: "Display", blurb: "All-caps display" },
  { name: "Cinzel", importName: "Cinzel", factory: Cinzel as Factory, category: "Display", blurb: "Roman capitals" },
  { name: "Caveat", importName: "Caveat", factory: Caveat as Factory, category: "Script", blurb: "Casual handwriting" },
];

type LocalFont = {
  name: string;
  factory: Factory;
  importName: string;
  weights: string;
  blurb: string;
};

const LOCAL: LocalFont[] = [
  { name: "Lausanne", factory: Lausanne as Factory, importName: "Lausanne", weights: "400", blurb: "A precise editorial display" },
  { name: "DxSlight", factory: DxSlight as Factory, importName: "DxSlight", weights: "500, 800 italic", blurb: "Decorative medium + ultra" },
  { name: "DxSlight Medium Ultra", factory: DxSlightMediumUltra as Factory, importName: "DxSlightMediumUltra", weights: "500", blurb: "Decorative medium" },
  { name: "DxSlight ExtBd UltraSlant", factory: DxSlightExtBdUltraSlant as Factory, importName: "DxSlightExtBdUltraSlant", weights: "800 italic", blurb: "Heavy display slant" },
  { name: "Varent Grotesk", factory: VarentGrotesk as Factory, importName: "VarentGrotesk", weights: "700, 200 italic", blurb: "Modern grotesk" },
  { name: "Varent Grotesk Bold", factory: VarentGroteskBold as Factory, importName: "VarentGroteskBold", weights: "700", blurb: "Bold variant" },
  { name: "Varent Grotesk ExtLtIta", factory: VarentGroteskExtLtIta as Factory, importName: "VarentGroteskExtLtIta", weights: "200 italic", blurb: "Extra-light italic" },
  { name: "Zimula", factory: Zimula as Factory, importName: "Zimula", weights: "100-900 + ink trap + ink spot", blurb: "Full weight ladder" },
];

const ZIMULA_WEIGHTS: ReadonlyArray<{ weight: number; style: "normal" | "ink-trap" | "ink-spot"; label: string }> = [
  { weight: 100, style: "normal", label: "Thin" },
  { weight: 200, style: "normal", label: "ExtraLight" },
  { weight: 300, style: "normal", label: "Light" },
  { weight: 400, style: "normal", label: "Regular" },
  { weight: 500, style: "normal", label: "Medium" },
  { weight: 600, style: "normal", label: "SemiBold" },
  { weight: 700, style: "normal", label: "Bold" },
  { weight: 800, style: "normal", label: "ExtraBold" },
  { weight: 900, style: "normal", label: "Black" },
];

function ZIMULA_FAMILY(style: "normal" | "ink-trap" | "ink-spot"): string {
  if (style === "ink-trap") return "'ZimulaInkTrap'";
  if (style === "ink-spot") return "'ZimulaInkSpot'";
  return "'Zimula'";
}

function ZimulaLadder() {
  return (
    <div className="space-y-2.5">
      {ZIMULA_WEIGHTS.map((w) => (
        <div
          key={`${w.weight}-${w.style}`}
          className="flex items-baseline gap-4"
        >
          <span className="w-20 shrink-0 font-mono text-xs text-fg-subtle">
            {w.weight} {w.label}
          </span>
          <span
            className="truncate text-fg"
            style={{
              fontFamily: ZIMULA_FAMILY(w.style),
              fontWeight: w.weight,
              fontSize: "1.75rem",
              lineHeight: 1.2,
            }}
          >
            The quick brown fox jumps
          </span>
        </div>
      ))}
    </div>
  );
}

const FEATURED_GROUPS: ReadonlyArray<{ name: string; fonts: FeaturedFont[] }> = [
  { name: "Sans-serif", fonts: FEATURED.filter((f) => f.category === "Sans") },
  { name: "Serif", fonts: FEATURED.filter((f) => f.category === "Serif") },
  { name: "Monospace", fonts: FEATURED.filter((f) => f.category === "Mono") },
  { name: "Display & script", fonts: FEATURED.filter((f) => f.category === "Display" || f.category === "Script") },
];

export default function FontsPage() {
  const localCss = localFontCss();

  return (
    <div className="container-page py-16 sm:py-20">
      <header className="mx-auto max-w-3xl text-center">
        <div className="badge badge-accent mb-5 inline-flex">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" />
          Typography
        </div>
        <h1 className="text-balance text-5xl font-semibold tracking-tight text-fg sm:text-6xl">
          Every font, every weight,
          <br />
          live in your browser.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-fg-muted">
          2,071 Google fonts and 8 local font families, all available as on-demand imports. Pick a
          font, see it in action, and copy the import statement into your project.
        </p>
        <dl className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { v: "2,071", l: "Google fonts" },
            { v: "8", l: "Local families" },
            { v: "27+", l: "Zimula weights" },
            { v: "auto", l: "Subsetting" },
          ].map((s) => (
            <div
              key={s.l}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <dt className="font-mono text-2xl font-semibold text-fg">{s.v}</dt>
              <dd className="mt-1 text-xs uppercase tracking-wider text-fg-subtle">
                {s.l}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      <section className="mt-20">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold tracking-tight text-fg">
            Live preview
          </h2>
          <span className="text-sm text-fg-muted">
            Type a name to load any of the 2,071 Google fonts.
          </span>
        </div>
        <FontStudio />
      </section>

      <section className="mt-24">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold tracking-tight text-fg">
            Featured Google fonts
          </h2>
          <span className="text-sm text-fg-muted">
            25 of 2,071 — every one ships the same way.
          </span>
        </div>
        <p className="mb-8 max-w-2xl text-fg-muted">
          These are the fonts most teams reach for. Use the search above to preview any of the
          remaining 2,046.
        </p>
        {FEATURED_GROUPS.map((group) => (
          <div key={group.name} className="mb-10">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              {group.name}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.fonts.map((f) => {
                const font = f.factory();
                return (
                  <div
                    key={f.name}
                    className="group flex flex-col gap-2 rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong"
                    style={font.style}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h4 className="text-sm font-medium text-fg">{f.name}</h4>
                      <span className="text-xs text-fg-subtle">{f.blurb}</span>
                    </div>
                    <div className="truncate text-2xl text-fg">Beautiful type</div>
                    <code className="mt-auto truncate font-mono text-[11px] text-fg-muted" style={{ fontFamily: "ui-monospace, monospace" }}>
                      import {"{ "}{f.importName}{" }"} from &quot;swift-rust/font/google&quot;
                    </code>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-24">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold tracking-tight text-fg">
            Local fonts
          </h2>
          <span className="text-sm text-fg-muted">
            8 families bundled in the framework.
          </span>
        </div>
        <p className="mb-8 max-w-2xl text-fg-muted">
          Bundled in <code className="font-mono text-xs">packages/font/src/local/</code> and
          served from <code className="font-mono text-xs">/_swift-rust/fonts/</code>. Use them
          when you need exact control over weights or want to avoid a network round-trip.
        </p>
        <SafeHtml as="style" content={createTrustedHtml(localCss)} />

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {LOCAL.filter((f) => f.name !== "Zimula").map((f) => {
            const font = f.factory();
            return (
              <div
                key={f.name}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-6"
                style={font.style}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-sm font-medium text-fg">{f.name}</h4>
                  <span className="font-mono text-[11px] text-fg-subtle" style={{ fontFamily: "ui-monospace, monospace" }}>
                    {f.weights}
                  </span>
                </div>
                <div className="text-3xl text-fg">Aa Bb Cc 123</div>
                <p className="text-xs text-fg-muted">{f.blurb}</p>
                <code className="mt-auto truncate font-mono text-[11px] text-fg-muted" style={{ fontFamily: "ui-monospace, monospace" }}>
                  import {"{ "}{f.importName}{" }"} from &quot;swift-rust/font&quot;
                </code>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <div>
              <h4 className="text-sm font-medium text-fg">Zimula</h4>
              <p className="mt-0.5 text-xs text-fg-muted">
                Full weight ladder 100–900 in three styles (normal, ink-trap, ink-spot)
              </p>
            </div>
            <span className="font-mono text-[11px] text-fg-subtle">
              27 weights
            </span>
          </div>
          <ZimulaLadder />
          <code className="mt-6 block truncate font-mono text-[11px] text-fg-muted">
            import {"{ "}Zimula{" }"} from &quot;swift-rust/font&quot;
          </code>
        </div>
      </section>

      <section className="mt-24">
        <h2 className="mb-2 text-2xl font-semibold tracking-tight text-fg">
          How to use
        </h2>
        <p className="mb-8 max-w-2xl text-fg-muted">
          Three patterns cover almost every case. Drop them into your{" "}
          <code className="font-mono text-xs">app/layout.tsx</code> and you&apos;re shipping.
        </p>
        <div className="space-y-6">
          <CodeBlock
            filename="app/layout.tsx"
            caption="Google fonts · one import, one variable, the whole tree gets it"
            code={`import { Geist, GeistMono } from "swift-rust/font/google";

const geist = Geist({ subsets: ["latin"], display: "swap", variable: true });
const geistMono = GeistMono({ subsets: ["latin"], display: "swap", variable: true });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html className={\`\${geist.variable} \${geistMono.variable}\`}>
      <body className={geist.className}>{children}</body>
    </html>
  );
}`}
          />
          <CodeBlock
            filename="app/fonts.ts"
            caption="Local fonts · point at a file, get a CSS class back"
            code={`import { localFont } from "swift-rust/font/local";

const heading = localFont({
  src: "./fonts/Heading-Bold.woff2",
  weight: "700",
  display: "swap",
  variable: true,
});

export { heading };`}
          />
          <CodeBlock
            filename="app/layout.tsx"
            caption="Local font CSS · inject @font-face declarations from the framework"
            code={`import { SafeHtml, createTrustedHtml } from "swift-rust";
import { localFontCss, Lausanne } from "swift-rust/font";

const css = createTrustedHtml(localFontCss());
const lausanne = Lausanne({ variable: true });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html className={lausanne.variable}>
      <head>
        <SafeHtml as="style" content={css} />
      </head>
      <body>{children}</body>
    </html>
  );
}`}
          />
        </div>
      </section>
    </div>
  );
}

function CodeBlock({
  filename,
  caption,
  code,
}: {
  filename: string;
  caption: string;
  code: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-2.5">
        <span className="font-mono text-xs text-fg-muted">{filename}</span>
        <span className="text-xs text-fg-subtle">{caption}</span>
      </div>
      <pre className="overflow-x-auto bg-bg p-5 font-mono text-xs leading-relaxed text-fg">
        <code>{code}</code>
      </pre>
    </div>
  );
}
