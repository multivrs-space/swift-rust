import type { Metadata } from "swift-rust";
import { Link } from "swift-rust";
import { siteConfig } from "@/lib/site.config";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Swift Rust team.",
};

const CHANNELS = [
  {
    name: "GitHub",
    handle: "multivrs-space/swift-rust",
    href: siteConfig.githubUrl,
    description: "Issues, PRs, and discussion.",
  },
  {
    name: "Discord",
    handle: "discord.gg/swift-rust",
    href: "https://discord.gg/swift-rust",
    description: "Real-time help and announcements.",
  },
  {
    name: "Email",
    handle: "hello@swift-rust.dev",
    href: "mailto:hello@swift-rust.dev",
    description: "Security reports and private inquiries.",
  },
];

export default function ContactPage() {
  return (
    <div className="container-page py-16 sm:py-20">
      <div className="grid gap-16 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-fg-subtle">
            Contact
          </p>
          <h1 className="mt-2 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Let&apos;s talk.
          </h1>
          <p className="mt-5 text-pretty text-lg leading-relaxed text-fg-muted">
            Bug reports, feature requests, partnership ideas, or just to say hi. Pick a channel or
            use the form.
          </p>

          <ul className="mt-10 space-y-6">
            {CHANNELS.map((c) => (
              <li key={c.name} className="group">
                <Link
                  href={c.href}
                  className="flex items-start justify-between gap-6 border-b border-border pb-6 transition-colors last:border-0"
                >
                  <div>
                    <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-fg-subtle">
                      {c.name}
                    </p>
                    <p className="mt-1 font-mono text-[0.9375rem] text-fg group-hover:text-accent">
                      {c.handle}
                    </p>
                    <p className="mt-1 text-[0.875rem] text-fg-muted">
                      {c.description}
                    </p>
                  </div>
                  <svg
                    viewBox="0 0 24 24"
                    className="mt-1 h-4 w-4 shrink-0 text-fg-subtle transition-all group-hover:translate-x-0.5 group-hover:text-fg"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <form className="card p-6 sm:p-8">
            <h2 className="text-[0.95rem] font-semibold">Send a message</h2>
            <p className="mt-1 text-[0.8125rem] text-fg-muted">
              We&apos;ll get back to you within a business day.
            </p>
            <div className="mt-6 space-y-5">
              <div>
                <label htmlFor="contact-name" className="block text-[0.8125rem] font-medium">
                  Name
                </label>
                <input id="contact-name" name="name" type="text" className="input mt-1.5" />
              </div>
              <div>
                <label htmlFor="contact-email" className="block text-[0.8125rem] font-medium">
                  Email
                </label>
                <input id="contact-email" name="email" type="email" className="input mt-1.5" />
              </div>
              <div>
                <label htmlFor="contact-subject" className="block text-[0.8125rem] font-medium">
                  Subject
                </label>
                <select id="contact-subject" name="subject" className="input mt-1.5">
                  <option>Bug report</option>
                  <option>Feature request</option>
                  <option>Partnership</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label htmlFor="contact-message" className="block text-[0.8125rem] font-medium">
                  Message
                </label>
                <textarea
                  id="contact-message"
                  name="message"
                  rows={5}
                  className="textarea mt-1.5"
                  placeholder="What's on your mind?"
                />
              </div>
              <button type="submit" className="btn btn-primary w-full">
                Send message
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
