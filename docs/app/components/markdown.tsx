import { Fragment, type ReactNode } from "react";

/**
 * Minimal Markdown → React renderer for the API-reference pages.
 *
 * Returns an array of plain elements (not wrapped in a component) so that
 * DocArticle can still walk the h2/h3 headings to build the "On this page"
 * list. Supports the subset these docs use: h1–h3, paragraphs, unordered
 * lists, fenced code blocks, GFM pipe tables, inline code, bold, and links.
 */
export function renderMarkdown(src: string): ReactNode[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let key = 0;
  const k = () => key++;
  let i = 0;

  const isTableSep = (s: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(s) && s.includes("-");

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) {
      i++;
      continue;
    }

    // blank
    if (line.trim() === "") {
      i++;
      continue;
    }

    // fenced code
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length) {
        const cur = lines[i];
        if (cur === undefined || cur.trim().startsWith("```")) break;
        buf.push(cur);
        i++;
      }
      i++; // closing fence
      out.push(
        <div className="code-block" key={k()}>
          {lang ? (
            <div className="code-block-header">
              <span>{lang}</span>
            </div>
          ) : null}
          <pre>
            <code>{buf.join("\n")}</code>
          </pre>
        </div>,
      );
      continue;
    }

    // heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h && h[1] && h[2]) {
      const level = h[1].length;
      const content = inline(h[2]);
      if (level === 1) out.push(<h1 key={k()}>{content}</h1>);
      else if (level === 2) out.push(<h2 key={k()}>{content}</h2>);
      else if (level === 3) out.push(<h3 key={k()}>{content}</h3>);
      else out.push(<h4 key={k()}>{content}</h4>);
      i++;
      continue;
    }

    // table
    const nextLine = lines[i + 1];
    if (line.trim().startsWith("|") && nextLine !== undefined && isTableSep(nextLine)) {
      const header = splitRow(line);
      i += 2; // header + separator
      const rows: string[][] = [];
      while (i < lines.length) {
        const cur = lines[i];
        if (cur === undefined || !cur.trim().startsWith("|")) break;
        rows.push(splitRow(cur));
        i++;
      }
      const cell = { padding: "0.5rem", borderBottom: "1px solid var(--border)" } as const;
      out.push(
        <table key={k()} style={{ width: "100%", borderCollapse: "collapse", margin: "1rem 0" }}>
          <thead>
            <tr>
              {header.map((c) => (
                <th key={k()} style={{ ...cell, textAlign: "left" }}>
                  {inline(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={k()}>
                {r.map((c) => (
                  <td key={k()} style={cell}>
                    {inline(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i];
        if (cur === undefined || !/^\s*[-*]\s+/.test(cur)) break;
        items.push(cur.replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      out.push(
        <ul key={k()}>
          {items.map((it) => (
            <li key={k()}>{inline(it)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // paragraph (gather consecutive plain lines)
    const para: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i];
      if (
        next === undefined ||
        next.trim() === "" ||
        /^(#{1,6})\s/.test(next) ||
        next.trim().startsWith("```") ||
        /^\s*[-*]\s+/.test(next) ||
        next.trim().startsWith("|")
      ) {
        break;
      }
      para.push(next);
      i++;
    }
    out.push(<p key={k()}>{inline(para.join(" "))}</p>);
  }

  return out;
}

/** Split a GFM table row into cells, respecting escaped pipes (\|). */
function splitRow(row: string): string[] {
  const trimmed = row.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cur = "";
  for (let j = 0; j < trimmed.length; j++) {
    if (trimmed[j] === "\\" && trimmed[j + 1] === "|") {
      cur += "|";
      j++;
    } else if (trimmed[j] === "|") {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += trimmed[j];
    }
  }
  cells.push(cur.trim());
  return cells;
}

/** Inline formatting: `code`, **bold**, [text](url). */
function inline(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: tokenizer loop
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) {
      nodes.push(<code key={key++}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("**")) {
      nodes.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    } else {
      const link = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok);
      if (link && link[1] && link[2])
        nodes.push(
          <a key={key++} href={link[2]}>
            {link[1]}
          </a>,
        );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <Fragment>{nodes}</Fragment>;
}
