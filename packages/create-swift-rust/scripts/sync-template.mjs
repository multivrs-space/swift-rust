#!/usr/bin/env node
// Builds packages/create-swift-rust/templates/default from examples/full-demo.
// Run at build/prepack time so the published scaffold mirrors the live demo
// without committing a duplicate (which would drift). dotfiles are stored with
// a `_` prefix because npm rewrites/strips real dotfiles inside packages.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const repoRoot = resolve(pkgRoot, "..", "..");
const demo = join(repoRoot, "examples", "full-demo");
const out = join(pkgRoot, "templates", "default");
const uiRegistry = join(repoRoot, "packages", "ui", "registry");
const uiOut = join(pkgRoot, "templates", "ui");

const PLACEHOLDER = "__PROJECT_NAME__";

// The default swift-rust ui component set the scaffolder ships (keep in sync
// with SWIFT_RUST_UI_DEFAULTS in src/index.ts).
const UI_COMPONENTS = ["accordion", "alert", "avatar", "button", "card", "input", "label"];

// Flatten the @swift-rust/ui registry into templates/ui so the published
// scaffolder can copy the canonical components without a workspace dependency.
async function syncUi() {
  await rm(uiOut, { recursive: true, force: true });
  await mkdir(uiOut, { recursive: true });
  for (const name of UI_COMPONENTS) {
    await cp(join(uiRegistry, "components", `${name}.tsx`), join(uiOut, `${name}.tsx`));
  }
  await cp(join(uiRegistry, "lib", "utils.ts"), join(uiOut, "utils.ts"));
  console.log(`✓ synced ${UI_COMPONENTS.length} swift-rust ui components → ${uiOut}`);
}

async function main() {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await syncUi();

  // 1. Source tree + public assets (recompressed, ~3 MB of JPGs).
  await cp(join(demo, "src"), join(out, "src"), { recursive: true });
  await cp(join(demo, "public"), join(out, "public"), { recursive: true });

  // 2. Verbatim config files.
  for (const f of [
    "swift-rust.config.json",
    "vercel.json",
    "biome.json",
    "globals.d.ts",
    "postcss.config.mjs",
  ]) {
    await cp(join(demo, f), join(out, f));
  }

  // 3. Standalone package.json (no workspace deps / turbo prebuild).
  const demoPkg = JSON.parse(await readFile(join(demo, "package.json"), "utf8"));
  const pkg = {
    name: PLACEHOLDER,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "swift-rust dev",
      build: "swift-rust build",
      start: "swift-rust start",
      lint: "biome check .",
      format: "biome format --write .",
      typecheck: "tsc --noEmit",
      test: "bun test",
    },
    dependencies: { ...demoPkg.dependencies },
    devDependencies: { ...demoPkg.devDependencies },
    engines: {
      bun: ">=1.3.0",
    },
  };
  await writeFile(join(out, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

  // 4. tsconfig that resolves the published base config.
  const tsconfig = {
    extends: "swift-rust/tsconfig.base.json",
    compilerOptions: {
      lib: ["ESNext", "DOM", "DOM.Iterable"],
      jsx: "preserve",
      paths: { "@/*": ["./src/*"] },
    },
    include: ["src/**/*", "globals.d.ts", ".swift-rust/types/**/*"],
    exclude: ["node_modules", "dist", ".swift-rust", ".turbo"],
  };
  await writeFile(join(out, "tsconfig.json"), `${JSON.stringify(tsconfig, null, 2)}\n`);

  // 5. dotfiles (underscore-prefixed; scaffolder restores the dot).
  const gitignore = [
    "node_modules/",
    ".swift-rust/",
    ".vercel/",
    "dist/",
    ".turbo/",
    "target/",
    "*.log",
    ".DS_Store",
    "tsconfig.tsbuildinfo",
    "",
    "# env files — ignore everything except the example",
    ".env",
    ".env.*",
    "!.env.example",
    "",
  ].join("\n");
  await writeFile(join(out, "_gitignore"), gitignore);

  const envExample = await readFile(join(demo, ".env.example"), "utf8").catch(
    () => "SWIFT_RUST_SITE_URL=http://localhost:3000\n",
  );
  await writeFile(join(out, "_env.example"), envExample);
  await writeFile(join(out, "_env.local"), envExample);

  const readme = `# ${PLACEHOLDER}

A [swift-rust](https://github.com/multivrs-space/swift-rust) app — the full demo
starter: blog, dashboard, API routes, and the Image / PDF / Video / Font
components wired up.

## Develop

\`\`\`bash
bun run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000).

## Build

\`\`\`bash
bun run build   # → .vercel/output (Build Output API v3)
\`\`\`

## Structure

\`\`\`
src/
  app/         file-based routes (pages, layouts, API routes)
  components/  shared UI
  lib/         data + helpers
public/        static assets and samples
\`\`\`
`;
  await writeFile(join(out, "README.md"), readme);

  // Strip the monorepo-only structure test from the scaffold.
  await rm(join(out, "src", "app", "structure.test.ts"), { force: true });

  console.log(`✓ synced template → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
