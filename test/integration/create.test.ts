import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const GEN_PKG = join(ROOT, "packages", "create-swift-rust");
const GEN = join(GEN_PKG, "dist", "index.js");
const FONT_GOOGLE = join(ROOT, "packages", "font", "dist", "google.js");

// Each scaffold asks the npm registry for the latest swift-rust (4s timeout).
setDefaultTimeout(30_000);

const tmps: string[] = [];
function scaffold(args: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "sr-create-"));
  tmps.push(dir);
  const r = spawnSync("node", [GEN, "app", ...args, "--yes"], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0)
    throw new Error(`scaffold failed (${args.join(" ")}):\n${r.stdout}\n${r.stderr}`);
  return join(dir, "app");
}

beforeAll(() => {
  // Ensure the generator + font dist are built (the test imports both).
  for (const pkg of [GEN_PKG, join(ROOT, "packages", "font")]) {
    const r = spawnSync("bun", ["run", "build"], { cwd: pkg, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`build ${pkg} failed:\n${r.stderr}`);
  }
}, 120_000);

afterAll(() => {
  for (const d of tmps) rmSync(d, { recursive: true, force: true });
});

describe("create-swift-rust: full demo", () => {
  const app = () => scaffold(["--full"]);
  test("scaffolds the demo routes + editor config", () => {
    const a = app();
    expect(existsSync(join(a, "src", "app", "blog"))).toBe(true);
    expect(existsSync(join(a, "src", "app", "dashboard"))).toBe(true);
    expect(existsSync(join(a, ".vscode", "settings.json"))).toBe(true);
    const pkg = JSON.parse(readFileSync(join(a, "package.json"), "utf8"));
    expect(pkg.dependencies?.["swift-rust"]).toBeDefined();
  });
});

describe("create-swift-rust: minimal (TS)", () => {
  test("clean app, no demo routes, no deprecated baseUrl", () => {
    const a = scaffold(["--minimal"]);
    expect(existsSync(join(a, "src", "app", "page.tsx"))).toBe(true);
    expect(existsSync(join(a, "src", "app", "blog"))).toBe(false);
    expect(existsSync(join(a, "biome.json"))).toBe(true);
    const tsconfig = readFileSync(join(a, "tsconfig.json"), "utf8");
    expect(tsconfig).not.toContain("baseUrl");
    expect(tsconfig).not.toContain("ignoreDeprecations");
  });
});

describe("create-swift-rust: minimal (JS + ESLint + no Tailwind + top-level app)", () => {
  test("honors every flag", () => {
    const a = scaffold(["--minimal", "--js", "--eslint", "--no-tailwind", "--no-src-dir"]);
    expect(existsSync(join(a, "jsconfig.json"))).toBe(true);
    expect(existsSync(join(a, "eslint.config.mjs"))).toBe(true);
    expect(existsSync(join(a, "app", "page.jsx"))).toBe(true);
    expect(existsSync(join(a, "src"))).toBe(false);
    expect(existsSync(join(a, "tailwind.config.ts"))).toBe(false);
  });
});

describe("create-swift-rust: UI kit selection", () => {
  test("swift-rust ui scaffolds the registry components + cn helper + professional home", () => {
    const a = scaffold(["--minimal", "--swift-rust-ui"]);
    const ui = join(a, "src", "components", "ui");
    for (const name of ["accordion", "alert", "avatar", "button", "card", "input", "label"]) {
      expect(existsSync(join(ui, `${name}.tsx`))).toBe(true);
    }
    // The button must carry the third (design) dimension.
    const button = readFileSync(join(ui, "button.tsx"), "utf8");
    expect(button).toContain("ButtonDesign");
    expect(button).toContain('"glass"');
    // cn helper lands at lib/utils.ts; the home page is a professional starter, not a style sampler.
    expect(existsSync(join(a, "src", "lib", "utils.ts"))).toBe(true);
    const page = readFileSync(join(a, "src", "app", "page.tsx"), "utf8");
    expect(page).toContain("quiet, professional baseline");
    expect(page).toContain("Project health");
    expect(page).not.toContain("One button, every style");
    // A UI kit implies Tailwind even though --tailwind wasn't passed.
    expect(existsSync(join(a, "src", "app", "globals.css"))).toBe(true);
    // swift-rust ui doesn't need class-variance-authority.
    const pkg = JSON.parse(readFileSync(join(a, "package.json"), "utf8"));
    expect(pkg.dependencies?.clsx).toBeDefined();
    expect(pkg.dependencies?.["class-variance-authority"]).toBeUndefined();
    expect(pkg.devDependencies?.shadcn).toBeUndefined();
  });

  test("swift-rust ui JavaScript scaffold contains valid JS/JSX", () => {
    const a = scaffold(["--minimal", "--js", "--swift-rust-ui"]);
    const files: string[] = [];
    const collect = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) collect(p);
        else if (/\.(jsx?|mjs)$/.test(entry.name)) files.push(p);
      }
    };
    collect(join(a, "src"));
    for (const file of files) {
      const loader = file.endsWith(".jsx") ? "jsx" : "js";
      expect(() =>
        new Bun.Transpiler({ loader }).transformSync(readFileSync(file, "utf8")),
      ).not.toThrow();
    }
  });

  test("shadcn scaffolds components.json + the shadcn devDep", () => {
    const a = scaffold(["--minimal", "--shadcn"]);
    expect(existsSync(join(a, "components.json"))).toBe(true);
    expect(existsSync(join(a, "src", "components", "ui", "button.tsx"))).toBe(true);
    const pkg = JSON.parse(readFileSync(join(a, "package.json"), "utf8"));
    expect(pkg.dependencies?.["class-variance-authority"]).toBeDefined();
    expect(pkg.devDependencies?.shadcn).toBeDefined();
  });

  test("--no-ui leaves the project without a components/ui dir", () => {
    const a = scaffold(["--minimal", "--no-ui", "--tailwind"]);
    expect(existsSync(join(a, "src", "components", "ui"))).toBe(false);
    expect(existsSync(join(a, "components.json"))).toBe(false);
  });
});

describe("generated layout font imports are real exports", () => {
  // This is the regression guard for the `Geist_Mono` bug: every name the
  // scaffolded layout imports from swift-rust/font/google must actually exist.
  test("every swift-rust/font/google import resolves", async () => {
    const a = scaffold(["--minimal"]);
    const layout = readFileSync(join(a, "src", "app", "layout.tsx"), "utf8");
    const match = layout.match(/import\s*\{([^}]+)\}\s*from\s*["']swift-rust\/font\/google["']/);
    expect(match).not.toBeNull();
    const names = (match?.[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(names.length).toBeGreaterThan(0);
    const mod = (await import(FONT_GOOGLE)) as Record<string, unknown>;
    for (const name of names) {
      expect(typeof mod[name]).toBe("function");
    }
  });
});
