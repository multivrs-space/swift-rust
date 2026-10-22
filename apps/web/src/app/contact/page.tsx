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
    <div className="container-page py-12 sm:py-16">
      <div className="mx-auto max-w-5xl">
        <header className="mx-auto max-w-2xl border-b border-border pb-10 text-center">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-accent">
            Contact
          </p>
          <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Let&apos;s talk.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-relaxed text-fg-muted sm:text-lg">
            Bug reports, feature requests, partnership ideas, or just to say hello. Choose the
            channel that fits, or send us a message.
          </p>
        </header>

        <div className="mt-10 grid gap-6 lg:grid-cols-2 lg:items-start">
          <section className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="border-b border-border bg-surface-2/70 p-6">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-accent">
                Direct channels
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">Find us where you work</h2>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                Public questions are best on GitHub or Discord. Use email for anything private.
              </p>
            </div>

            <ul>
              {CHANNELS.map((channel) => (
                <li key={channel.name} className="group border-b border-border last:border-b-0">
                  <Link
                    href={channel.href}
                    className="flex items-center justify-between gap-5 p-6 transition-colors hover:bg-surface-2"
                  >
                    <div>
                      <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-fg-subtle">
                        {channel.name}
                      </p>
                      <p className="mt-1.5 font-mono text-[0.9rem] text-fg transition-colors group-hover:text-accent">
                        {channel.handle}
                      </p>
                      <p className="mt-1 text-sm text-fg-muted">{channel.description}</p>
                    </div>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-fg-subtle transition-[border-color,color,transform] group-hover:translate-x-0.5 group-hover:border-border-strong group-hover:text-fg">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden
                      >
                        <path
                          d="M5 12h14M13 6l6 6-6 6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <form className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-accent">
              Send a message
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              Tell us what&apos;s on your mind
            </h2>
            <p className="mt-2 text-sm text-fg-muted">
              We&apos;ll get back to you within one business day.
            </p>
            <div className="mt-7 grid gap-5 sm:grid-cols-2">
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
              <div className="sm:col-span-2">
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
              <div className="sm:col-span-2">
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
              <button type="submit" className="btn btn-primary sm:col-span-2">
                Send message
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
