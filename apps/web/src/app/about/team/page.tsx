import type { Metadata } from "swift-rust";
import { Link } from "swift-rust";

export const metadata: Metadata = {
  title: "Team",
  description: "The systems, compiler, and design engineers behind Swift Rust.",
};

const TEAM = [
  {
    name: "Alex Chen",
    role: "Founding Engineer · Architecture",
    focus: "Four rendering modes & router core",
    bio: "Previously led framework architecture at a global edge cloud provider. Writing production Rust since 2017.",
  },
  {
    name: "Priya Singh",
    role: "Runtime Engineer · SSR & JSC",
    focus: "0.90ms streaming SSR & worker pool",
    bio: "Spent five years working on React server rendering pipelines. Designed Swift Rust's Hyper + JavaScriptCore bridge.",
  },
  {
    name: "Jordan Kim",
    role: "Compiler Engineer · SWC & Security",
    focus: "RSC transforms, SR-E* diagnostics & SafeHtml",
    bio: "Long-time SWC contributor. Built the directive stripper, HMAC Server Action compiler pass, and CSPRNG token verifier.",
  },
  {
    name: "Maria Lopez",
    role: "Design Systems · UI & Typography",
    focus: "@swift-rust/ui & 2,071 zero-FOUT fonts",
    bio: "Architected the variant × size × design 3D styling matrix in @swift-rust/ui and the build-time font metric engine.",
  },
  {
    name: "Sam Rivera",
    role: "Infrastructure · Single Binary & ISR",
    focus: "Standalone binary compiler & edge cache",
    bio: "Engineered the single-binary packager, HMAC revalidation endpoints, and sub-30MB RSS production container profile.",
  },
];

export default function TeamPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/about"
        className="inline-flex items-center gap-1.5 text-[0.875rem] font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M19 12H5M11 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Back to About</span>
      </Link>

      <header className="mt-6 border-b border-border pb-8">
        <span className="badge badge-accent font-mono">CORE CONTRIBUTORS</span>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-fg sm:text-5xl">
          Five engineers, one binary.
        </h1>
        <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-fg-muted">
          A focused team of systems, compiler, and design engineers building the fastest full-stack
          React framework on the web.
        </p>
      </header>

      <ul className="mt-10 grid gap-5 sm:grid-cols-2">
        {TEAM.map((person) => (
          <li key={person.name} className="bento-card">
            <div>
              <div className="flex items-center gap-3.5">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-mono text-[0.875rem] font-bold text-white shadow-xs"
                  style={{ background: hashColor(person.name) }}
                >
                  {person.name
                    .split(" ")
                    .map((s) => s[0])
                    .join("")}
                </div>
                <div>
                  <h2 className="font-display text-[1.0625rem] font-bold text-fg">{person.name}</h2>
                  <p className="text-[0.8125rem] text-fg-muted">{person.role}</p>
                </div>
              </div>
              <p className="mt-4 text-[0.875rem] leading-relaxed text-fg-muted">{person.bio}</p>
            </div>
            <div className="mt-5 border-t border-border pt-3">
              <span className="font-mono text-[0.72rem] text-accent">Focus: {person.focus}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 65%, 42%)`;
}
