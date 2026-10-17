import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";

interface DocFrontmatter {
  title?: string;
  summary?: string;
  code?: string;
  category?: string;
}

const DOCS_ROOT = join(cwd(), "..", "errors", "docs");

export function generateStaticParams() {
  if (!existsSync(DOCS_ROOT)) return [];
  return readdirSync(DOCS_ROOT)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ slug: f.replace(/\.md$/, "") }));
}

export default async function DocPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const file = `${slug.join("/")}.md`;
  const path = join(DOCS_ROOT, file);
  if (!existsSync(path)) return <h1>Not found</h1>;
  const content = readFileSync(path, "utf8");
  const fm = parseFrontmatter(content);
  const heading = fm.title ?? slug[slug.length - 1] ?? "Doc";
  return (
    <article>
      <h1>{heading}</h1>
      {fm.summary ? <p>{fm.summary}</p> : null}
      <pre>
        <code>{content}</code>
      </pre>
    </article>
  );
}

function parseFrontmatter(content: string): DocFrontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match?.[1]) return {};
  const fm: DocFrontmatter = {};
  for (const line of match[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    fm[line.slice(0, i).trim() as keyof DocFrontmatter] = line.slice(i + 1).trim();
  }
  return fm;
}
