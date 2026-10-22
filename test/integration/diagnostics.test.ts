import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  diagnose,
  renderTerminal,
  toMarkdown,
} from "../../packages/swift-rust/bin/diagnostics.mjs";
import { errorOverlayHTML } from "../../packages/swift-rust/bin/error-overlay.mjs";
import { unsupportedBunMessage } from "../../packages/swift-rust/bin/runtime/bun-version.mjs";

type DiffLine = { text: string };
type Help = { diff?: DiffLine[]; snippet?: string };

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "sr-diag-"));
  return {
    dir,
    file(name: string, source: string) {
      const path = join(dir, name);
      writeFileSync(path, source);
      return path;
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe("rustc-style diagnostics", () => {
  test("suggests a similar export", () => {
    const fx = fixture();
    try {
      fx.file("ui.tsx", "export function Button() { return null; }\n");
      const page = fx.file(
        "page.tsx",
        'import { Buton } from "./ui";\nexport default function Page() { return <Buton />; }\n',
      );
      const err = Object.assign(new Error('No matching export in "./ui" for import "Buton"'), {
        position: { file: page, line: 1, column: 10, length: 5 },
      });
      const d = diagnose(err, { cwd: fx.dir });
      const text = renderTerminal(d);
      expect(text).toContain("error[SR0003]");
      expect(text).toContain("Button");
      expect(text).toContain("help: a similar export exists");
      expect(
        (d.helps as Help[]).some((h) =>
          (h.diff || []).some((line) => line.text.includes("Button")),
        ),
      ).toBe(true);
      expect(toMarkdown(d)).toContain("Button");
    } finally {
      fx.cleanup();
    }
  });

  test("suggests optional chaining for a null property read", () => {
    const fx = fixture();
    try {
      const page = fx.file(
        "page.tsx",
        "export default function Page({ data }) {\n  return <h1>{data.title}</h1>;\n}\n",
      );
      const err = Object.assign(
        new Error("Cannot read properties of undefined (reading 'title')"),
        {
          position: { file: page, line: 2, column: 16, length: 10 },
        },
      );
      const d = diagnose(err, { cwd: fx.dir });
      expect(
        (d.helps as Help[]).some((h) =>
          (h.diff || []).some((line) => line.text.includes("data?.title")),
        ),
      ).toBe(true);
    } finally {
      fx.cleanup();
    }
  });

  test("offers the React import for an undefined hook", () => {
    const fx = fixture();
    try {
      const page = fx.file(
        "page.tsx",
        "export default function Page() {\n  const [n, setN] = useState(0);\n  return <span>{n}</span>;\n}\n",
      );
      const err = Object.assign(new Error("useState is not defined"), {
        position: { file: page, line: 2, column: 22, length: 8 },
      });
      const d = diagnose(err, { cwd: fx.dir });
      expect(d.code).toBeTruthy();
      expect(JSON.stringify(d.helps)).toContain("react");
      expect(JSON.stringify(d.helps)).toContain("useState");
    } finally {
      fx.cleanup();
    }
  });

  test("explains a browser global used during render", () => {
    const fx = fixture();
    try {
      const page = fx.file(
        "page.tsx",
        "export default function Page() {\n  return <h1>{window.innerWidth}</h1>;\n}\n",
      );
      const err = Object.assign(new Error("window is not defined"), {
        position: { file: page, line: 2, column: 15, length: 6 },
      });
      const d = diagnose(err, { cwd: fx.dir });
      expect(d.title).toContain("window");
      expect((d.helps as Help[]).some((h) => (h.snippet || "").includes("useEffect"))).toBe(true);
    } finally {
      fx.cleanup();
    }
  });

  test("names a thrown null", () => {
    const d = diagnose(null, { cwd: process.cwd() });
    expect(d.code).toBe("SR0148");
    expect(renderTerminal(d)).toContain("error[SR0148]");
  });

  test("renders the overlay from a diagnostic", () => {
    const html = errorOverlayHTML({
      message: "Cannot read properties of undefined (reading 'title')",
      cwd: process.cwd(),
    });
    expect(html).toContain("data-sr-error-page");
    expect(html).toContain("__sr_diagnostic");
    expect(html).toContain("Copy for AI");
    expect(html).toContain("hmr-client.js");
  });

  test("prints an unsupported Bun version like rustc", () => {
    const text = unsupportedBunMessage("1.0.0");
    expect(text).toContain("error[SR0073]");
    expect(text).toContain("= help:");
    expect(text).toContain("bun upgrade");
  });
});
