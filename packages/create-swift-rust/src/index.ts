#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import pc from "picocolors";

type Language = "ts" | "js";
type Linter = "biome" | "eslint";
type Renderer = "ssr" | "ssr-wasm" | "ssr-htmx" | "wasm";
type Template = "full" | "minimal";
// Which component kit to scaffold. "swift-rust-ui" is our own shadcn-style
// registry with an extra style dimension (variant × size × design); "shadcn" is
// canonical shadcn/ui; "none" skips UI scaffolding entirely.
type UiKit = "none" | "shadcn" | "swift-rust-ui";
type AskAnswer<T> = T | string | symbol;
const MINIMUM_BUN_VERSION = "1.3.0";

interface Answers {
  projectName: string;
  template: Template;
  language: Language;
  renderer: Renderer;
  linter: Linter;
  tailwind: boolean;
  srcDir: boolean;
  importAlias: string;
  ui: UiKit;
  install: boolean;
}

/** Locate the bundled full-demo template (src/ in dev, dist/ when published). */
function templateDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    resolve(here, "..", "templates", "default"),
    resolve(here, "templates", "default"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return resolve(here, "..", "templates", "default");
}

async function writeVscodeConfig(target: string): Promise<void> {
  await mkdir(join(target, ".vscode"), { recursive: true });
  await writeFile(
    join(target, ".vscode", "settings.json"),
    `${JSON.stringify(
      {
        "css.lint.unknownAtRules": "ignore",
        "scss.lint.unknownAtRules": "ignore",
        "less.lint.unknownAtRules": "ignore",
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(target, ".vscode", "extensions.json"),
    `${JSON.stringify({ recommendations: ["bradlc.vscode-tailwindcss", "biomejs.biome"] }, null, 2)}\n`,
  );
}

/** Copy the full-demo template into `target` (restores dotfiles, substitutes name). */
async function copyTemplate(target: string, projectName: string): Promise<void> {
  const src = templateDir();
  if (!existsSync(src)) {
    throw new Error(
      `Template not found at ${src}. Run \`node scripts/sync-template.mjs\` before publishing.`,
    );
  }
  await mkdir(target, { recursive: true });
  await cp(src, target, { recursive: true });
  for (const [from, to] of [
    ["_gitignore", ".gitignore"],
    ["_env.example", ".env.example"],
    ["_env.local", ".env.local"],
  ] as Array<[string, string]>) {
    const fromPath = join(target, from);
    if (existsSync(fromPath)) await rename(fromPath, join(target, to));
  }
  const displayName = projectName === "." ? basename(resolve(target)) : projectName;
  const packagePath = join(target, "package.json");
  if (existsSync(packagePath)) {
    const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
    packageJson.name = displayName;
    packageJson.dependencies["swift-rust"] = await resolveSwiftRustVersion();
    packageJson.engines = { ...packageJson.engines, bun: `>=${MINIMUM_BUN_VERSION}` };
    await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  }
  const readmePath = join(target, "README.md");
  if (existsSync(readmePath)) {
    const contents = await readFile(readmePath, "utf8");
    await writeFile(readmePath, contents.split("__PROJECT_NAME__").join(displayName));
  }
  await writeVscodeConfig(target);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function isValidName(name: string): boolean {
  return /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name);
}

/** ".", "./", "" all mean "scaffold into the current directory". */
function isCurrentDir(name: string): boolean {
  const t = name.trim();
  return t === "." || t === "./" || t === "";
}
/** Normalize a project-name input: current-dir variants → ".", strip trailing slashes. */
function normalizeProjectName(name: string): string {
  const t = name.trim();
  if (isCurrentDir(t)) return ".";
  return t.replace(/\/+$/, "");
}

function isValidAlias(alias: string): boolean {
  return /^[a-zA-Z@][a-zA-Z0-9_/*-]*$/.test(alias);
}

const HELP = `
${pc.bold("create-swift-rust")} - scaffold a new swift-rust project

${pc.bold("Usage")}
  ${pc.cyan("bun create swift-rust@latest")} [project-name] [options]

${pc.bold("Options")}
  ${pc.yellow("--full")}                  Scaffold the full demo (default; opinionated)
  ${pc.yellow("--minimal")}               Scaffold a minimal app (configurable below)
  ${pc.yellow("--ts, --typescript")}      Use TypeScript (default)
  ${pc.yellow("--js, --javascript")}      Use JavaScript
  ${pc.yellow("--tailwind")}              Install Tailwind CSS
  ${pc.yellow("--no-tailwind")}           Skip Tailwind CSS
  ${pc.yellow("--swift-rust-ui")}         Install swift-rust ui components (default)
  ${pc.yellow("--shadcn")}                Install canonical shadcn/ui components
  ${pc.yellow("--no-ui")}                 Skip UI components
  ${pc.yellow("--src-dir")}               Use a src/ directory (src/app) (default)
  ${pc.yellow("--no-src-dir")}            Use top-level app/
  ${pc.yellow("--biome")}                 Use Biome for linting (default)
  ${pc.yellow("--eslint")}                Use ESLint for linting
  ${pc.yellow("--import-alias <prefix>")} Set import alias (default "@/*")
  ${pc.yellow("--ssr")}                   Server-side rendering
  ${pc.yellow("--ssr-wasm")}              SSR with WASM hydration (default)
  ${pc.yellow("--ssr-htmx")}              SSR with HTMX
  ${pc.yellow("--wasm")}                  Full WASM SPA
  ${pc.yellow("--install")}               Run bun install after scaffolding
  ${pc.yellow("--no-install")}            Skip bun install (default)
  ${pc.yellow("--yes, -y")}               Skip prompts, use defaults
  ${pc.yellow("--help, -h")}              Show this help

${pc.bold("Examples")}
  ${pc.cyan("bun create swift-rust@latest")}
  ${pc.cyan("bun create swift-rust@latest my-app --ts --tailwind --src-dir")}
  ${pc.cyan("bun create swift-rust@latest ./ --tailwind --eslint")}
`;

function parseFlags(args: string[]): Record<string, string | boolean | undefined> {
  const flags: Record<string, string | boolean | undefined> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === "--ts" || a === "--typescript") flags.language = "ts";
    else if (a === "--js" || a === "--javascript") flags.language = "js";
    else if (a === "--full" || a === "--full-demo") flags.template = "full";
    else if (a === "--minimal") flags.template = "minimal";
    else if (a === "--template") flags.template = args[++i];
    else if (a === "--tailwind") flags.tailwind = true;
    else if (a === "--no-tailwind") flags.tailwind = false;
    else if (a === "--swift-rust-ui" || a === "--sr-ui") flags.ui = "swift-rust-ui";
    else if (a === "--shadcn") flags.ui = "shadcn";
    else if (a === "--no-ui" || a === "--no-shadcn") flags.ui = "none";
    else if (a === "--src-dir") flags.srcDir = true;
    else if (a === "--no-src-dir") flags.srcDir = false;
    else if (a === "--biome") flags.linter = "biome";
    else if (a === "--eslint") flags.linter = "eslint";
    else if (a === "--import-alias") flags.importAlias = args[++i];
    else if (a === "--ssr") flags.renderer = "ssr";
    else if (a === "--ssr-wasm") flags.renderer = "ssr-wasm";
    else if (a === "--ssr-htmx") flags.renderer = "ssr-htmx";
    else if (a === "--wasm") flags.renderer = "wasm";
    else if (a === "--renderer") flags.renderer = args[++i];
    else if (a === "--install") flags.install = true;
    else if (a === "--no-install") flags.install = false;
    else if (a === "--yes" || a === "-y") flags.yes = true;
    else if (a === "--help" || a === "-h") flags.help = true;
    else if (!a.startsWith("-") && !flags._name) flags._name = a as string;
  }
  return flags;
}

const RENDERER_OPTIONS: Array<{ value: Renderer; label: string; hint: string }> = [
  {
    value: "ssr-wasm",
    label: "SSR + WASM hydration",
    hint: "Default. Server-rendered HTML, WASM-hydrated interactive islands.",
  },
  { value: "ssr", label: "SSR only", hint: "Server-rendered HTML, no client JavaScript at all." },
  {
    value: "ssr-htmx",
    label: "SSR + HTMX",
    hint: "Progressive enhancement with HTMX-style interactions.",
  },
  {
    value: "wasm",
    label: "Full WASM SPA",
    hint: "Single-page app compiled entirely to WebAssembly.",
  },
];

async function askQuestions(
  flags: Record<string, string | boolean | undefined>,
  positional: string | undefined,
): Promise<Answers | null> {
  const yesMode = flags.yes === true;

  const projectName =
    positional ??
    (yesMode
      ? "my-swift-rust-app"
      : await p.text({
          message: "What is your project named?",
          placeholder: "my-swift-rust-app",
          defaultValue: "my-swift-rust-app",
          validate: (v) => {
            if (!v) return "Project name is required";
            if (!isCurrentDir(v) && !isValidName(normalizeProjectName(v)))
              return 'Invalid name. Use letters, numbers, dashes, and underscores — or "." for the current directory.';
            return undefined;
          },
        }));

  if (!projectName || p.isCancel(projectName)) {
    p.cancel("Aborted.");
    return null;
  }

  // Template selection. The full demo is opinionated (TS + Tailwind + Biome +
  // src/app), so picking it skips the configuration prompts.
  let templateAnswer: AskAnswer<Template>;
  if (flags.template) {
    templateAnswer = flags.template as string;
  } else if (yesMode) {
    templateAnswer = "full";
  } else {
    templateAnswer = (await p.select({
      message: "Which template would you like?",
      options: [
        {
          value: "full",
          label: "Full demo",
          hint: "blog, dashboard, API, Image/PDF/Video/Font — TS + Tailwind + Biome",
        },
        { value: "minimal", label: "Minimal", hint: "a clean starter you configure below" },
      ],
      initialValue: "full" as Template,
    })) as unknown as AskAnswer<Template>;
  }
  if (p.isCancel(templateAnswer)) {
    p.cancel("Aborted.");
    return null;
  }
  const template: Template = templateAnswer as Template;

  const askInstall = async (): Promise<boolean | null> => {
    const a: boolean | symbol =
      typeof flags.install === "boolean"
        ? flags.install
        : yesMode
          ? false
          : ((await p.confirm({
              message: "Would you like to install dependencies with `bun install`?",
              initialValue: true,
            })) ?? false);
    if (p.isCancel(a)) {
      p.cancel("Aborted.");
      return null;
    }
    return a === true;
  };

  if (template === "full") {
    const install = await askInstall();
    if (install === null) return null;
    return {
      projectName: normalizeProjectName(String(projectName)),
      template: "full",
      language: "ts",
      renderer: "ssr-wasm",
      linter: "biome",
      tailwind: true,
      srcDir: true,
      importAlias: "@/*",
      ui: "none",
      install,
    };
  }

  let languageAnswer: AskAnswer<Language>;
  if (flags.language) {
    languageAnswer = flags.language as string;
  } else if (yesMode) {
    languageAnswer = "ts";
  } else {
    const languageOptions: Array<{ value: Language; label: string; hint: string }> = [
      { value: "ts", label: "TypeScript", hint: "Type-safe, recommended" },
      { value: "js", label: "JavaScript", hint: "No type checking" },
    ];
    const result = await p.select({
      message: "Which language would you like to use?",
      options: languageOptions,
      initialValue: "ts" as Language,
    });
    languageAnswer = result as unknown as AskAnswer<Language>;
  }

  if (p.isCancel(languageAnswer)) {
    p.cancel("Aborted.");
    return null;
  }
  const language: Language = languageAnswer as Language;

  let renderer: Renderer = (flags.renderer as Renderer | undefined) ?? "ssr-wasm";
  if (!flags.renderer && !yesMode) {
    const r = (await p.select({
      message: "Which rendering mode do you want?",
      options: RENDERER_OPTIONS,
      initialValue: "ssr-wasm",
    })) as unknown as Renderer | symbol as Renderer | symbol;
    if (p.isCancel(r)) {
      p.cancel("Aborted.");
      return null;
    }
    renderer = r as Renderer;
  }

  let linterAnswer: AskAnswer<Linter>;
  if (flags.linter) {
    linterAnswer = flags.linter as string;
  } else if (yesMode) {
    linterAnswer = "biome";
  } else {
    const linterOptions: Array<{ value: Linter; label: string; hint: string }> = [
      { value: "biome", label: "Biome", hint: "Fast Rust-based all-in-one tool (recommended)" },
      { value: "eslint", label: "ESLint", hint: "The classic, more configurable" },
    ];
    const result = await p.select({
      message: "Which linter would you like to use?",
      options: linterOptions,
      initialValue: "biome" as Linter,
    });
    linterAnswer = result as unknown as AskAnswer<Linter>;
  }

  if (p.isCancel(linterAnswer)) {
    p.cancel("Aborted.");
    return null;
  }
  const linter: Linter = linterAnswer as Linter;

  const tailwindAnswer: boolean | symbol =
    typeof flags.tailwind === "boolean"
      ? flags.tailwind
      : yesMode
        ? false
        : ((await p.confirm({
            message: "Would you like to use Tailwind CSS?",
            initialValue: true,
          })) ?? false);

  if (p.isCancel(tailwindAnswer)) {
    p.cancel("Aborted.");
    return null;
  }

  const tailwind: boolean = tailwindAnswer === true;

  // UI kit: swift-rust ui (our registry, default) · shadcn/ui · none.
  // Only meaningful with Tailwind; without it, skip straight to "none".
  let ui: UiKit;
  if (typeof flags.ui === "string") {
    ui = flags.ui as UiKit;
  } else if (!tailwind) {
    ui = "none";
  } else if (yesMode) {
    ui = "swift-rust-ui";
  } else {
    const uiAnswer = (await p.select({
      message: "Which component library would you like to set up?",
      options: [
        {
          value: "swift-rust-ui",
          label: "swift-rust ui",
          hint: "our shadcn-style registry — variant × size × design (3d, glass, neo…), Tailwind v4",
        },
        { value: "shadcn", label: "shadcn/ui", hint: "the canonical shadcn registry" },
        { value: "none", label: "None", hint: "no components — add them later" },
      ],
      initialValue: "swift-rust-ui" as UiKit,
    })) as unknown as UiKit | symbol;
    if (p.isCancel(uiAnswer)) {
      p.cancel("Aborted.");
      return null;
    }
    ui = uiAnswer as UiKit;
  }

  const srcDirAnswer: boolean | symbol =
    typeof flags.srcDir === "boolean"
      ? flags.srcDir
      : yesMode
        ? true
        : ((await p.confirm({
            message: "Would you like to use a `src/` directory for your app code?",
            initialValue: true,
          })) ?? true);

  if (p.isCancel(srcDirAnswer)) {
    p.cancel("Aborted.");
    return null;
  }

  const srcDir: boolean = srcDirAnswer === true;

  // Import alias: default @/*. Ask a yes/no first (like Next.js) so the common
  // case is a single Enter; only prompt for a value if the user opts in.
  let importAlias = "@/*";
  if (typeof flags.importAlias === "string") {
    importAlias = flags.importAlias;
  } else if (!yesMode) {
    const customize = await p.confirm({
      message: "Would you like to customize the import alias (@/* by default)?",
      initialValue: false,
    });
    if (p.isCancel(customize)) {
      p.cancel("Aborted.");
      return null;
    }
    if (customize) {
      const aliasAnswer = await p.text({
        message: "What import alias would you like configured?",
        placeholder: "@/*",
        defaultValue: "@/*",
        validate: (v) => {
          if (!v) return undefined; // empty → keep the default
          if (!isValidAlias(v)) return "Invalid alias. Use letters, numbers, @, /, *, -, _.";
          return undefined;
        },
      });
      if (p.isCancel(aliasAnswer)) {
        p.cancel("Aborted.");
        return null;
      }
      importAlias = (aliasAnswer as string) || "@/*";
    }
  }

  const installAnswer: boolean | symbol =
    typeof flags.install === "boolean"
      ? flags.install
      : yesMode
        ? false
        : ((await p.confirm({
            message: "Would you like to install dependencies with `bun install`?",
            initialValue: true,
          })) ?? false);

  if (p.isCancel(installAnswer)) {
    p.cancel("Aborted.");
    return null;
  }

  const install: boolean = installAnswer === true;

  return {
    projectName: normalizeProjectName(String(projectName)),
    template: "minimal",
    language,
    renderer,
    linter,
    // A UI kit (chosen via flag) requires Tailwind, so it implies --tailwind even
    // if Tailwind wasn't requested. The prompt path already gates ui on tailwind.
    tailwind: tailwind || ui !== "none",
    srcDir,
    importAlias,
    ui,
    install,
  };
}

// Fallback pin used when the npm registry can't be reached at scaffold time.
// Kept in sync with the current swift-rust release so a generated project never
// advertises an ancient version. `^` still lets it float forward within the major.
const SWIFT_RUST_FALLBACK = "^1.11.0";

// Resolve the newest published swift-rust version so the scaffolded package.json
// reflects reality (e.g. ^1.10.5) instead of a stale literal like ^1.0.0. A caret
// range already installs the latest matching release, but showing the real number
// avoids the "it installed an old version" confusion. Falls back offline.
async function resolveSwiftRustVersion(): Promise<string> {
  try {
    const res = await fetch("https://registry.npmjs.org/swift-rust/latest", {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = (await res.json()) as { version?: string };
      if (data?.version && /^\d+\.\d+\.\d+/.test(data.version)) return `^${data.version}`;
    }
  } catch {
    // offline / registry down → use the pinned fallback
  }
  return SWIFT_RUST_FALLBACK;
}

async function writeProjectFiles(target: string, answers: Answers): Promise<void> {
  const {
    projectName: rawName,
    language,
    renderer,
    linter,
    tailwind,
    srcDir,
    importAlias,
    ui,
  } = answers;
  const useUi = ui !== "none";
  // When scaffolding into the current directory ("."), name the package after
  // the directory itself (like create-next-app), since "." is not a valid name.
  const projectName = rawName === "." ? basename(resolve(target)) : rawName;
  const appDir = join(target, srcDir ? "src/app" : "app");
  const componentsDir = join(target, srcDir ? "src/components" : "components");
  const libDir = join(target, srcDir ? "src/lib" : "lib");
  const uiDir = join(componentsDir, "ui");

  await mkdir(target, { recursive: true });
  await mkdir(appDir, { recursive: true });
  await mkdir(componentsDir, { recursive: true });
  await mkdir(libDir, { recursive: true });
  await mkdir(join(target, "public"), { recursive: true });
  if (useUi) {
    await mkdir(uiDir, { recursive: true });
  }

  const fileExt = (lang: Language) => (lang === "ts" ? "ts" : "js");
  const componentExt = (lang: Language) => (lang === "ts" ? "tsx" : "jsx");
  const jsxExt = componentExt(language);
  const swiftRustVersion = await resolveSwiftRustVersion();

  const pkg: Record<string, unknown> = {
    name: projectName,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "swift-rust dev",
      build: "swift-rust build",
      start: "swift-rust start",
      lint: linter === "biome" ? "biome check ." : "eslint .",
      test: "bun test",
      ...(language === "ts" ? { typecheck: "tsc --noEmit" } : {}),
      format: linter === "biome" ? "biome format --write ." : "prettier --write .",
    },
    dependencies: {
      "swift-rust": swiftRustVersion,
      react: "^19.0.0",
      "react-dom": "^19.0.0",
      // Tailwind lives in dependencies (not devDependencies): the swift-rust
      // build compiles CSS by loading @tailwindcss/postcss at build time, so it
      // must be installed in production. As a devDependency it gets pruned on
      // some hosts → the deployed site ships unstyled.
      ...(tailwind
        ? { tailwindcss: "^4.0.0", "@tailwindcss/postcss": "^4.0.0", postcss: "^8.4.0" }
        : {}),
      // Both kits need the cn() helper (clsx + tailwind-merge). shadcn also
      // pulls in class-variance-authority + tw-animate-css; swift-rust ui needs
      // neither (its components use plain class maps and v4-native animations).
      ...(useUi ? { clsx: "^2.1.1", "tailwind-merge": "^3.6.0", "lucide-react": "^0.460.0" } : {}),
      ...(ui === "shadcn"
        ? { "class-variance-authority": "^0.7.1", "tw-animate-css": "^1.0.0" }
        : {}),
    },
    devDependencies: {
      ...(language === "ts"
        ? { typescript: "^6.0.0", "@types/react": "^19.0.0", "@types/react-dom": "^19.0.0" }
        : {}),
      ...(linter === "biome" ? { "@biomejs/biome": "^2.4.16" } : { eslint: "^9.0.0" }),
      ...(ui === "shadcn" ? { shadcn: "^4.0.0" } : {}),
      ...(ui === "swift-rust-ui" ? { "@swift-rust/ui": "latest" } : {}),
    },
    engines: {
      bun: `>=${MINIMUM_BUN_VERSION}`,
    },
  };
  await writeFile(join(target, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

  const config = {
    rendering: renderer,
    image: { domains: [], formats: ["image/avif", "image/webp"] },
    font: { subsets: ["latin"], display: "swap" },
    pdf: { defaultPageSize: "A4" },
  };
  await writeFile(join(target, "swift-rust.config.json"), `${JSON.stringify(config, null, 2)}\n`);

  if (language === "ts") {
    const tsconfig = {
      extends: "swift-rust/tsconfig.base.json",
      compilerOptions: {
        jsx: "preserve",
        paths: { [importAlias]: [srcDir ? "./src/*" : "./*"] },
      },
      include: srcDir
        ? ["src/**/*", "globals.d.ts", ".swift-rust/types/**/*"]
        : ["app/**/*", "components/**/*", "lib/**/*", "globals.d.ts", ".swift-rust/types/**/*"],
      exclude: ["node_modules", "dist", ".swift-rust", ".turbo"],
    };
    await writeFile(join(target, "tsconfig.json"), `${JSON.stringify(tsconfig, null, 2)}\n`);
  } else {
    const jsconfig = {
      compilerOptions: {
        paths: { [importAlias]: [srcDir ? "./src/*" : "./*"] },
      },
      include: srcDir ? ["src/**/*"] : ["app/**/*", "components/**/*", "lib/**/*"],
    };
    await writeFile(join(target, "jsconfig.json"), `${JSON.stringify(jsconfig, null, 2)}\n`);
  }

  const gitignore = [
    "node_modules/",
    ".swift-rust/",
    ".vercel/",
    "dist/",
    ".turbo/",
    "target/",
    "*.log",
    ".DS_Store",
    "",
    "# env files — ignore everything except the example",
    ".env",
    ".env.*",
    "!.env.example",
  ].join("\n");
  await writeFile(join(target, ".gitignore"), `${gitignore}\n`);

  const vercelConfig = {
    $schema: "https://openapi.vercel.sh/vercel.json",
    buildCommand: "bun run build",
    installCommand: "bun install --frozen-lockfile",
    outputDirectory: ".vercel/output",
    framework: null,
    trailingSlash: false,
    cleanUrls: true,
    headers: [
      {
        source: "/_swift-rust/static/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/fonts/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ],
  };
  await writeFile(join(target, "vercel.json"), `${JSON.stringify(vercelConfig, null, 2)}\n`);

  if (tailwind) {
    const postcss = `const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
`;
    await writeFile(join(target, "postcss.config.mjs"), postcss);

    const uiTokens = useUi
      ? `

/* UI design tokens — shared by swift-rust ui and shadcn/ui.
   Components reference these via the @theme inline mapping below
   (bg-primary, text-muted-foreground, border-border, …).
   Retheme by editing the --ui-* values (light + .dark). */
:root {
  --ui-bg: #ffffff;
  --ui-fg: #09090b;
  --ui-card: #ffffff;
  --ui-card-fg: #09090b;
  --ui-popover: #ffffff;
  --ui-popover-fg: #09090b;
  --ui-primary: #18181b;
  --ui-primary-fg: #fafafa;
  --ui-secondary: #f4f4f5;
  --ui-secondary-fg: #18181b;
  --ui-muted: #f4f4f5;
  --ui-muted-fg: #71717a;
  --ui-accent: #f4f4f5;
  --ui-accent-fg: #18181b;
  --ui-destructive: #ef4444;
  --ui-destructive-fg: #fafafa;
  --ui-border: #e4e4e7;
  --ui-input: #e4e4e7;
  --ui-ring: #18181b;
  --ui-radius: 0.5rem;
}

.dark {
  --ui-bg: #09090b;
  --ui-fg: #fafafa;
  --ui-card: #09090b;
  --ui-card-fg: #fafafa;
  --ui-popover: #09090b;
  --ui-popover-fg: #fafafa;
  --ui-primary: #fafafa;
  --ui-primary-fg: #18181b;
  --ui-secondary: #27272a;
  --ui-secondary-fg: #fafafa;
  --ui-muted: #27272a;
  --ui-muted-fg: #a1a1aa;
  --ui-accent: #27272a;
  --ui-accent-fg: #fafafa;
  --ui-destructive: #7f1d1d;
  --ui-destructive-fg: #fafafa;
  --ui-border: #27272a;
  --ui-input: #27272a;
  --ui-ring: #d4d4d8;
}

@media (prefers-color-scheme: dark) {
  :root:not(.light) {
    --ui-bg: #09090b;
    --ui-fg: #fafafa;
    --ui-card: #09090b;
    --ui-card-fg: #fafafa;
    --ui-popover: #09090b;
    --ui-popover-fg: #fafafa;
    --ui-primary: #fafafa;
    --ui-primary-fg: #18181b;
    --ui-secondary: #27272a;
    --ui-secondary-fg: #fafafa;
    --ui-muted: #27272a;
    --ui-muted-fg: #a1a1aa;
    --ui-accent: #27272a;
    --ui-accent-fg: #fafafa;
    --ui-destructive: #7f1d1d;
    --ui-destructive-fg: #fafafa;
    --ui-border: #27272a;
    --ui-input: #27272a;
    --ui-ring: #d4d4d8;
  }
}

@theme inline {
  --color-background: var(--ui-bg);
  --color-foreground: var(--ui-fg);
  --color-card: var(--ui-card);
  --color-card-foreground: var(--ui-card-fg);
  --color-popover: var(--ui-popover);
  --color-popover-foreground: var(--ui-popover-fg);
  --color-primary: var(--ui-primary);
  --color-primary-foreground: var(--ui-primary-fg);
  --color-secondary: var(--ui-secondary);
  --color-secondary-foreground: var(--ui-secondary-fg);
  --color-muted: var(--ui-muted);
  --color-muted-foreground: var(--ui-muted-fg);
  --color-accent: var(--ui-accent);
  --color-accent-foreground: var(--ui-accent-fg);
  --color-destructive: var(--ui-destructive);
  --color-destructive-foreground: var(--ui-destructive-fg);
  --color-border: var(--ui-border);
  --color-input: var(--ui-input);
  --color-ring: var(--ui-ring);
  --radius: var(--ui-radius);
}
`
      : "";

    const css = `@import "tailwindcss";
${ui === "shadcn" ? '@import "tw-animate-css";' : ""}

@theme {
  --color-bg: #ffffff;
  --color-fg: #09090b;
  --color-accent: ${useUi ? "#f97316" : "#0070f3"};
  --font-sans: var(--font-geist-sans), system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, monospace;
}

@variant dark (&:where(.dark, .dark *));

@media (prefers-color-scheme: dark) {
  :root:not(.light) {
    --color-bg: #09090b;
    --color-fg: #fafafa;
  }
}

body {
  background: var(--color-bg);
  color: var(--color-fg);
  font-family: var(--font-sans);
}
${uiTokens}`;
    await writeFile(
      join(appDir, `globals.${fileExt(language)}`),
      language === "ts" ? `import "./globals.css";\n` : `import "./globals.css";\n`,
    );
    await writeFile(join(appDir, "globals.css"), css);
  }

  const layoutImports = `${language === "ts" ? 'import type { ReactNode } from "react";\n' : ""}import { Geist, GeistMono } from "swift-rust/font/google";
${tailwind ? `import "./globals.css";\n` : ""}
const geistSans = Geist({ subsets: ["latin"], display: "swap", variable: true });
const geistMono = GeistMono({ subsets: ["latin"], display: "swap", variable: true });

export const metadata = {
  title: {
    template: "%s | ${projectName}",
    default: "${projectName}",
  },
  description: "Built with swift-rust — the React framework powered with Rust + Bun. 10x faster than Next.js.",
};

export default function RootLayout(${language === "ts" ? "{ children }: { children: ReactNode }" : "{ children }"}) {
  return (
    <html
      lang="en"
      className={\`\${geistSans.variable} \${geistMono.variable} h-full antialiased\`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="${tailwind ? "min-h-full flex flex-col" : ""}">${tailwind ? "{children}" : "\\n        {children}\\n      "}</body>
    </html>
  );
}
`;
  await writeFile(join(appDir, `layout.${jsxExt}`), layoutImports);

  const shadcnHome = `import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <Badge variant="secondary" className="w-fit mb-2">Welcome</Badge>
          <CardTitle className="text-3xl sm:text-5xl">${projectName}</CardTitle>
          <CardDescription>
            Get started by editing <code>${srcDir ? "src/app/" : "app/"}page.${jsxExt}</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <a
            href="https://docs-swift-rust.vercel.app/"
            className={buttonVariants({ variant: "default" })}
          >
            Read the docs →
          </a>
          <a
            href="https://github.com/multivrs-space/swift-rust"
            className={buttonVariants({ variant: "outline" })}
          >
            GitHub
          </a>
        </CardContent>
      </Card>
    </main>
  );
}
`;

  const swiftRustUiHome = `import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="min-h-screen bg-bg text-fg">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <header className="flex items-center justify-between border-b border-border/70 pb-5">
          <div>
            <p className="text-sm font-medium text-fg/55">Swift Rust starter</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">${projectName}</h1>
          </div>
          <Button asChild size="sm" variant="outline">
            <a href="https://docs-swift-rust.vercel.app/">Docs</a>
          </Button>
        </header>

        <div className="grid flex-1 items-center gap-10 py-16 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="mb-6 inline-flex rounded-full border border-border bg-bg px-3 py-1 text-sm text-fg/65">
              Production-ready React on Rust + Bun
            </div>
            <h2 className="max-w-3xl text-5xl font-semibold leading-[0.98] tracking-tight sm:text-6xl">
              Build a fast app with a quiet, professional baseline.
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-fg/65">
              Routing, rendering, styling, and deployment defaults are already wired so you can focus on the product surface.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild>
                <a href="https://docs-swift-rust.vercel.app/">Read the docs</a>
              </Button>
              <Button asChild variant="outline">
                <a href="https://github.com/multivrs-space/swift-rust">GitHub</a>
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <p className="text-sm font-medium">Project health</p>
              <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                Ready
              </span>
            </div>
            <dl className="mt-5 grid gap-4">
              {[
                ["Framework", "swift-rust"],
                ["Renderer", "${renderer}"],
                ["Styling", "Tailwind CSS"],
                ["Components", "swift-rust ui"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-md border border-border/70 px-4 py-3">
                  <dt className="text-sm text-fg/55">{label}</dt>
                  <dd className="text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>
    </main>
  );
}
`;

  const homePage = tailwind
    ? ui === "shadcn"
      ? shadcnHome
      : ui === "swift-rust-ui"
        ? swiftRustUiHome
        : `export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-2xl text-center">
        <div className="inline-block mb-4 px-3 py-1 text-xs font-medium rounded-full bg-accent/10 text-accent">
          Welcome
        </div>
        <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-6">
          ${projectName}
        </h1>
        <p className="text-lg text-fg-secondary mb-8">
          Get started by editing <code>${srcDir ? "src/app/" : "app/"}page.${jsxExt}</code>.
        </p>
        <a
          href="https://docs-swift-rust.vercel.app/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-fg text-bg font-medium text-sm hover:opacity-90 transition-opacity"
        >
          Read the docs →
        </a>
      </div>
    </main>
  );
}
`
    : `export default function Home() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
      <div style={{ maxWidth: "32rem", textAlign: "center" }}>
        <h1>${projectName}</h1>
        <p>Get started by editing <code>${srcDir ? "src/app/" : "app/"}page.${jsxExt}</code>.</p>
        <a href="https://docs-swift-rust.vercel.app/">Read the docs →</a>
      </div>
    </main>
  );
}
`;
  await writeFile(join(appDir, `page.${jsxExt}`), homePage);

  const notFoundPage = tailwind
    ? `export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center">
        <h1 className="text-6xl font-bold mb-4">404</h1>
        <p className="text-fg-secondary">Page not found</p>
        <a href="/" className="text-accent mt-6 inline-block">← Go home</a>
      </div>
    </main>
  );
}
`
    : `export default function NotFound() {
  return (
    <main>
      <h1>404</h1>
      <p>Page not found</p>
      <a href="/">← Go home</a>
    </main>
  );
}
`;
  await writeFile(join(appDir, `not-found.${jsxExt}`), notFoundPage);

  if (linter === "biome") {
    const biome = {
      $schema: "https://biomejs.dev/schemas/2.4.16/schema.json",
      vcs: { enabled: true, clientKind: "git", useIgnoreFile: true },
      files: {
        includes: ["**", "!.swift-rust", "!node_modules", "!dist", "!.turbo"],
      },
      formatter: { enabled: true, indentStyle: "space", indentWidth: 2 },
      assist: { actions: { source: { organizeImports: "on" } } },
      linter: {
        enabled: true,
        rules: { recommended: true, a11y: { noSvgWithoutTitle: "off" } },
      },
      javascript: { formatter: { quoteStyle: "double", semicolons: "always" } },
    };
    await writeFile(join(target, "biome.json"), `${JSON.stringify(biome, null, 2)}\n`);
  } else {
    const eslint = `import swiftRust from "eslint-config-swift-rust";

export default [
  ...swiftRust,
  {
    ignores: [".swift-rust/**", "node_modules/**", "dist/**", ".turbo/**"],
  },
];
`;
    await writeFile(join(target, "eslint.config.mjs"), eslint);
  }

  const readme = `# ${projectName}

Built with [swift-rust](https://swift-rust.multivrs.space/) — the React framework powered with Rust + Bun. 10x faster than Next.js.

## Scripts

- \`bun run dev\` — start the dev server
- \`bun run build\` — build for production
- \`bun run start\` — start the production server
- \`bun run lint\` — run the linter
- \`bun run typecheck\` — run TypeScript checks (if TS)
- \`bun run test\` — run tests
- \`bun run format\` — format the code

## Project structure

 ${
   srcDir
     ? `\`\`\`\nsrc/\n  app/\n    layout.${jsxExt}\n    page.${jsxExt}\n    not-found.${jsxExt}\n  components/\n  lib/\n\`\`\``
     : `\`\`\`\napp/\n  layout.${jsxExt}\n  page.${jsxExt}\n  not-found.${jsxExt}\ncomponents/\nlib/\n\`\`\``
}

## Learn more

- [Documentation](https://docs-swift-rust.vercel.app/)
- [Examples](https://github.com/multivrs-space/swift-rust/tree/main/examples)
- [Discord](https://discord.gg/swift-rust)

## Deploy to Vercel

The fastest way to deploy is to push to GitHub and import the repo on Vercel:

\`\`\`bash
git init && git add -A && git commit -m "init"
git remote add origin https://github.com/you/${projectName}.git
git push -u origin main
\`\`\`

Then on [vercel.com/new](https://vercel.com/new), import the repo. No configuration needed — \`vercel.json\` is included. Your site will be live at \`https://${projectName}.vercel.app\`.

For custom domains and ISR / serverless functions, see the [deploy guide](https://docs-swift-rust.vercel.app/docs/getting-started/deploying).
`;
  await writeFile(join(target, "README.md"), readme);

  const envExample = `# Example environment variables. Copy values you need into .env.local.
# .env.local is git-ignored; .env.example is committed.
# SWIFT_RUST_RUNTIME=/path/to/bun
`;
  await writeFile(join(target, ".env.example"), envExample);
  // Local env file (git-ignored) so the app works out of the box.
  const envLocal = `# Local environment variables (git-ignored). Not committed.
# SWIFT_RUST_RUNTIME=/path/to/bun
`;
  await writeFile(join(target, ".env.local"), envLocal);

  const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0a0a0a"/><g stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" fill="none"><circle cx="16" cy="16" r="6.4"/><path d="M16 4.4v2.6M16 25v2.6M4.4 16h2.6M25 16h2.6M7.9 7.9l1.8 1.8M22.3 22.3l1.8 1.8M7.9 24.1l1.8-1.8M22.3 9.7l1.8-1.8"/></g><path d="M17.8 9.3 L11.6 17 H15.2 L14.2 22.8 L20.4 15 H16.8 Z" fill="#fb923c"/></svg>
`;
  // Metadata icons live in the app directory (Next.js style): swift-rust
  // serves app/favicon.* from the site root and auto-links them in <head>.
  await writeFile(join(appDir, "favicon.svg"), favicon);

  // 32x32 favicon.ico (PNG-encoded) matching favicon.svg, so browsers that
  // request /favicon.ico get a real icon instead of a 404.
  const faviconIco =
    "AAABAAEAICAAAAEAIAAZBQAAFgAAAIlQTkcNChoKAAAADUlIRFIAAAAgAAAAIAgGAAAAc3p69AAAAAZiS0dEAP8A/wD/oL2nkwAABM5JREFUWIXFl19sU2UYxn/f6cbsoTsFoqywPw5BMzodpGNxhUIINMREgssEg5ELI7tUs/HnYiExRI1wwRKWXRBiMGEmphqykKl3JYOOBLMy3U7nthDI6LqRzii6ullit75eYJtNtnWWoU/yJc15z/s8z/f2y/ueTzEDNpttdTKZfB94FXgeWM7SYBK4BXyraVrLxMTET6mASv2wWq0HgAtKqfwlEp0TIvI78E48Hr+UNmC1Wg8opb6caegJQ0TkjXg8fknZbLbV09PTt7PZeU1NDQCXL1/OxkRM07QNStf1j4ET2TCMjIwAUFRUlE06wEc5wN5ss3Nzc7NNTWGvBqx/XJZsISIbNMA2V1DTNPr6+vD7/RiGMSdBR0cHHR0dc8YMw8Dv99PX14emaXO+o5TKnzsCJJNJotEobreb9vb2WSaUUpSXl9Pa2srFixdxOp2PiLe3t+N2u4lGoySTyflkQNd1mW85HA7p6uoSEZGWlhax2+1y7NgxiUQiMhPJ+2EJh8Ny5MgRsdvt0tLSIiIiXV1d4nA45uXXdV2Urusyv72Hu2lsbOTKlSscP34cj8dDMpmku7ubUCjEyulfeHlljDWvf4hSis7OTs6cOcPu3bs5deoUsVhsIfqFK5BadrtdOjs7RUSkp6dHqqurRdd1KXo6X26frJL3dj0rbrdbTNMUEZFAICCGYWTk1XVd5j0DM1FXV4fH46G3t5c9e/Zgmia5FsXnh9bz7Ko8+qNxent78Xq9hEIhtm/fzuHDhxdDTca/QCnFwMAAhYWFbNu2DdM0AWh6rZg69zMAlJzsZfzBNACbN2/m+vXrRCIRnE4nIgvSk7ECGzdupLi4mJs3b6bF33StSouP/PZnWhygp6eH7u5uSkpKKCsry0Q/20BNTQ2RSITR0VFGR0fx+XyUlpYCpMWrSpbTXFuSzilasYzx0y7GT7u4deIl1hq56XdLS0vx+Xxpvkgkkp4fi65AqoSaplGQn0vroefIy3k0LTEtvP3FEPdiiXTjyVR+WMQZcDqdBINBgsEgO3funBXrb3yRQvsyABouD/PZdz8DEAgEqKyspLKyksHBwQUNZKzAwMAAw8PDbNmyhU2bNqWfG09ZWGs8FPf9cD8t7nK5cLlchMPhjOKLMiAiNDc3o5Ti/Pnz2GwPR0e5w4pSYN77g/q2YQBsNhvnzp1DKcXZs2czigOLb0SBQEBEREzTlK1bt8q7u0rk3ifV8sLaFaLrung8HgmFQiIicvXq1UU3on/Vio8ePcqOHTsQEcbaPuD7X62MWdZQUVGBy+VCKcW1a9doamrC6/U+fiv+5zAyDEMaGhokHA5Lcmxw1kC6e/eu1NfXi2EYSzeM/H4/brebYDDIvn37Zu2mrKyMdevWATA0NDTrwKXGcVVVFTdu3MDr9c5bgHkNaJqGaZpEo1Fqa2vnLKXP5wPg4MGDj8QMw6CtrQ2Hw0FFRcW83wTKarXGsr0LjI2NAVBQUJBNOkBMU0rdyTZ7CXBHA77JNjuRSJBIJB7HwNf/58Vk3GKxbEhdzfYrpb7iv72a7Y/H420WgKmpqf6cnJwflVKvAHlPWHxcRN6Kx+NtAJbU06mpqf68vLwLIvIAyP97LVsi0QmgD/jUYrEcmpyc7E4F/gIrAoFO2P2bCQAAAABJRU5ErkJggg==";
  await writeFile(join(appDir, "favicon.ico"), Buffer.from(faviconIco, "base64"));

  if (ui === "shadcn") {
    await scaffoldShadcn({ target, uiDir, libDir, componentExt: jsxExt, srcDir, language });
  } else if (ui === "swift-rust-ui") {
    await scaffoldSwiftRustUi({ uiDir, libDir, componentExt: jsxExt, language });
  }

  await writeVscodeConfig(target);
}

async function scaffoldShadcn(options: {
  target: string;
  uiDir: string;
  libDir: string;
  componentExt: string;
  srcDir: boolean;
  language: Language;
}): Promise<void> {
  const { target, uiDir, libDir, componentExt, srcDir, language } = options;

  const utilsContent = `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;

  const buttonContent = `import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-ring)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[var(--ui-primary)] text-[var(--ui-primary-fg)] hover:opacity-90",
        destructive: "bg-[var(--ui-destructive)] text-white hover:opacity-90",
        outline:
          "border border-[var(--ui-border)] bg-[var(--ui-bg)] hover:bg-[var(--ui-accent)] hover:text-[var(--ui-accent-fg)]",
        secondary: "bg-[var(--ui-secondary)] text-[var(--ui-secondary-fg)] hover:opacity-90",
        ghost: "hover:bg-[var(--ui-accent)] hover:text-[var(--ui-accent-fg)]",
        link: "text-[var(--ui-primary)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
`;

  const cardContent = `import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-card-fg)] shadow-sm",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-[var(--ui-muted-fg)]", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";
`;

  const inputContent = `import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-[var(--ui-border)] bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[var(--ui-fg)]",
        "placeholder:text-[var(--ui-muted-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-ring)] focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
`;

  const labelContent = `import * as React from "react";
import { cn } from "@/lib/utils";

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";
`;

  const badgeContent = `import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ui-ring)] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--ui-primary)] text-[var(--ui-primary-fg)] hover:opacity-90",
        secondary:
          "border-transparent bg-[var(--ui-secondary)] text-[var(--ui-secondary-fg)] hover:opacity-90",
        destructive:
          "border-transparent bg-[var(--ui-destructive)] text-white hover:opacity-90",
        outline: "text-[var(--ui-fg)] border-[var(--ui-border)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
`;

  const componentsJson = `{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": ${componentExt === "tsx"},
  "tailwind": {
    "config": "",
    "css": "${srcDir ? "src/app/globals.css" : "app/globals.css"}",
    "baseColor": "zinc",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
`;

  const source = (content: string) =>
    language === "js" ? stripTypeScriptForJavaScript(content) : content;
  await writeFile(join(libDir, `utils.${language === "js" ? "js" : "ts"}`), source(utilsContent));
  await writeFile(join(uiDir, `button.${componentExt}`), source(buttonContent));
  await writeFile(join(uiDir, `card.${componentExt}`), source(cardContent));
  await writeFile(join(uiDir, `input.${componentExt}`), source(inputContent));
  await writeFile(join(uiDir, `label.${componentExt}`), source(labelContent));
  await writeFile(join(uiDir, `badge.${componentExt}`), source(badgeContent));
  await writeFile(join(target, "components.json"), `${componentsJson}\n`);
}

function stripTypeScriptForJavaScript(source: string): string {
  return source
    .replace(/import\s+type\s+[^;]+;\n/g, "")
    .replace(/,\s*type\s+\w+/g, "")
    .replace(/type\s+\w+\s*,\s*/g, "")
    .replace(/export\s+type\s+\w+\s*=\s*[\s\S]*?;\n/g, "")
    .replace(/export\s+interface\s+\w+[\s\S]*?\n}\n/g, "")
    .replace(/interface\s+\w+[\s\S]*?\n}\n/g, "")
    .replace(/React\.forwardRef<[\s\S]*?>\(/g, "React.forwardRef(")
    .replace(/React\.createContext<[^>]+>\(/g, "React.createContext(")
    .replace(/React\.useState<[^)]*>\(/g, "React.useState(")
    .replace(/const\s+(\w+):\s*Record<[^=]+>\s*=/g, "const $1 =")
    .replace(/}\s*:\s*[A-Za-z0-9_<>, |&?{}:[\]]+\s*=\s*{}\)/g, "} = {})")
    .replace(/}\s*:\s*{[\s\S]*?}\)/g, "})")
    .replace(/function\s+(\w+)\(([^)]*)\):\s*[\w.<>[\] |&]+/g, "function $1($2)")
    .replace(/\(([^)]*)\):\s*[\w.<>[\] |&]+\s*=>/g, "($1) =>")
    .replace(/(\.\.\.\w+):\s*[^,)]+/g, "$1")
    .replace(/(\w+):\s*(string|number|boolean)\b/g, "$1")
    .replace(/:\s*React\.[A-Za-z0-9_.<>[\], |&]+/g, "")
    .replace(/:\s*[A-Z][A-Za-z0-9_<>, |&?]+(?=\s*[=,)])/g, "")
    .replace(/:\s*[A-Z][A-Za-z0-9_<>, |&?{}:[\]]+(?=\s*=\s*{})/g, "")
    .replace(/\s+as\s+React\.[A-Za-z0-9_.<>[\], |&?{}:]+/g, "")
    .replace(/\s+as\s+Set<[^>]+>/g, "")
    .replace(/\s+as\s+const/g, "")
    .replace(/\s+as\s+string/g, "");
}

// The default component set for swift-rust ui — the components the user asked us
// to ship first, all carrying the variant × size × design dimensions.
const SWIFT_RUST_UI_DEFAULTS = [
  "accordion",
  "alert",
  "avatar",
  "button",
  "card",
  "input",
  "label",
] as const;

/** Locate the @swift-rust/ui registry: the synced copy bundled into this
 *  package (templates/ui), or the monorepo source when running from a checkout. */
function swiftRustUiRegistry(): { componentsDir: string; utilsFile: string } | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates: Array<{ componentsDir: string; utilsFile: string }> = [
    // Published: scripts/sync-template.mjs flattens the registry into templates/ui.
    {
      componentsDir: resolve(here, "..", "templates", "ui"),
      utilsFile: resolve(here, "..", "templates", "ui", "utils.ts"),
    },
    {
      componentsDir: resolve(here, "templates", "ui"),
      utilsFile: resolve(here, "templates", "ui", "utils.ts"),
    },
    // Monorepo source: packages/create-swift-rust/dist → packages/ui/registry.
    {
      componentsDir: resolve(here, "..", "..", "ui", "registry", "components"),
      utilsFile: resolve(here, "..", "..", "ui", "registry", "lib", "utils.ts"),
    },
  ];
  for (const c of candidates) {
    if (existsSync(c.componentsDir) && existsSync(c.utilsFile)) return c;
  }
  return null;
}

// Offline/pre-install fallback: copy the bundled registry components straight
// in, so the project isn't empty if `@swift-rust/ui add` (the real, CLI-driven
// path, run after install) can't be fetched. Mirrors how the shadcn path writes
// bundled components before trying `shadcn add`.
async function scaffoldSwiftRustUi(options: {
  uiDir: string;
  libDir: string;
  componentExt: string;
  language: Language;
}): Promise<void> {
  const { uiDir, libDir, componentExt, language } = options;
  const registry = swiftRustUiRegistry();
  if (!registry) {
    throw new Error(
      "swift-rust ui registry not found. Run `node scripts/sync-template.mjs` before packaging.",
    );
  }
  // The cn() helper the components import from "@/lib/utils".
  const source = (content: string) =>
    language === "js" ? stripTypeScriptForJavaScript(content) : content;
  await writeFile(
    join(libDir, `utils.${language === "js" ? "js" : "ts"}`),
    source(await readFile(registry.utilsFile, "utf8")),
  );
  for (const name of SWIFT_RUST_UI_DEFAULTS) {
    const src = await readFile(join(registry.componentsDir, `${name}.tsx`), "utf8");
    await writeFile(join(uiDir, `${name}.${componentExt}`), source(src));
  }
}

async function runInstall(target: string): Promise<void> {
  const { spawn } = await import("node:child_process");
  const runtime = findBun();
  if (!runtime) {
    throw new Error(
      `Bun ${MINIMUM_BUN_VERSION} or newer is required. Install Bun from https://bun.sh.`,
    );
  }
  return new Promise((resolve, reject) => {
    const proc = spawn(runtime, ["install"], { cwd: target, stdio: "inherit" });
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`bun install exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

function findBun(): string | null {
  if (process.versions.bun) return process.execPath;
  const executable = process.platform === "win32" ? "bun.exe" : "bun";
  const candidates = [
    process.env.BUN_INSTALL ? join(process.env.BUN_INSTALL, "bin", executable) : null,
    process.env.USERPROFILE ? join(process.env.USERPROFILE, ".bun", "bin", executable) : null,
    process.env.HOME ? join(process.env.HOME, ".bun", "bin", executable) : null,
    ...String(process.env.PATH ?? "")
      .split(delimiter)
      .filter(Boolean)
      .map((directory) => join(directory, executable)),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function validateBunVersion(): Promise<void> {
  const runtime = findBun();
  if (!runtime) {
    throw new Error(
      `Bun ${MINIMUM_BUN_VERSION} or newer is required. Install Bun from https://bun.sh.`,
    );
  }
  const version =
    runtime === process.execPath && process.versions.bun
      ? process.versions.bun
      : (await import("node:child_process"))
          .spawnSync(runtime, ["--version"], { encoding: "utf8" })
          .stdout?.trim();
  const [major = -1, minor = -1, patch = -1] = (String(version ?? "").split("-", 1)[0] ?? "")
    .split(".")
    .map((part) => Number.parseInt(part, 10));
  const supported =
    ![major, minor, patch].some((part) => Number.isNaN(part)) &&
    (major > 1 || (major === 1 && (minor > 3 || (minor === 3 && patch >= 0))));
  if (!supported) {
    throw new Error(
      `Bun ${MINIMUM_BUN_VERSION} or newer is required. Found ${version || "an unknown version"}. Run \`bun upgrade\` and try again.`,
    );
  }
}

const SHADCN_DEFAULT_COMPONENTS = ["button", "card", "input", "label", "badge"] as const;

async function runShadcnAdd(target: string, components: readonly string[]): Promise<boolean> {
  const { spawn } = await import("node:child_process");
  const runtime = findBun();
  if (!runtime) return false;
  return new Promise((resolve) => {
    const args = [
      "x",
      "--bun",
      "shadcn@latest",
      "add",
      ...components,
      "--yes",
      "--overwrite",
      "--cwd",
      target,
      "--silent",
    ];
    const proc = spawn(runtime, args, { cwd: target, stdio: "pipe" });
    proc.on("exit", (code) => {
      resolve(code === 0);
    });
    proc.on("error", () => resolve(false));
  });
}

// Drive the @swift-rust/ui CLI (the same one users run as `bunx @swift-rust/ui
// add <component>`) to install the starter components. The CLI auto-detects the
// src/ layout, runs init (cn helper + deps), and writes into components/ui.
async function runSwiftRustUiAdd(target: string, components: readonly string[]): Promise<boolean> {
  const { spawn } = await import("node:child_process");
  const runtime = findBun();
  if (!runtime) return false;
  return new Promise((resolve) => {
    const args = ["x", "@swift-rust/ui@latest", "add", ...components, "--yes", "--overwrite"];
    const proc = spawn(runtime, args, { cwd: target, stdio: "pipe" });
    proc.on("exit", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    process.exit(0);
  }
  await validateBunVersion();

  const isTTY = process.stdout.isTTY === true;
  if (!isTTY && !args.includes("--yes") && !args.includes("-y")) {
    console.error("Non-interactive mode: pass --yes to skip prompts, or run in a terminal.");
    process.exit(1);
  }
  const quiet = !isTTY;

  const flags = parseFlags(args);
  const positional = flags._name as string | undefined;

  if (!quiet) p.intro(pc.bgCyan(pc.black(" create-swift-rust ")));

  const answers = await askQuestions(flags, positional);
  if (!answers) process.exit(1);

  const { projectName, tailwind, linter, srcDir, install } = answers;
  const target = resolve(process.cwd(), projectName);

  if (projectName === ".") {
    if ((await listDir(target)).length > 0) {
      if (quiet) {
        console.error(`Target directory ${target} is not empty. Aborting.`);
        process.exit(1);
      }
      const proceed = await p.confirm({
        message: `Target directory ${pc.cyan(target)} is not empty. Continue?`,
        initialValue: false,
      });
      if (!proceed) {
        if (!quiet) p.cancel("Aborted.");
        process.exit(1);
      }
    }
  } else {
    if (await pathExists(target)) {
      if (quiet) {
        console.error(`Directory ${target} already exists. Aborting.`);
      } else {
        p.cancel(`Directory ${pc.red(target)} already exists.`);
      }
      process.exit(1);
    }
  }

  const summary = (
    answers.template === "full"
      ? [
          `${pc.cyan("•")} Project:     ${pc.bold(projectName === "." ? resolve(target) : projectName)}`,
          `${pc.cyan("•")} Template:    Full demo (blog, dashboard, API, Image/PDF/Video/Font)`,
          `${pc.cyan("•")} Language:    TypeScript`,
          `${pc.cyan("•")} Styling:     Tailwind CSS`,
          `${pc.cyan("•")} Linter:      Biome`,
          `${pc.cyan("•")} Install:     ${install ? "Yes" : "No"}`,
        ]
      : [
          `${pc.cyan("•")} Project:     ${pc.bold(projectName === "." ? resolve(target) : projectName)}`,
          `${pc.cyan("•")} Template:    Minimal`,
          `${pc.cyan("•")} Language:    ${answers.language === "ts" ? "TypeScript" : "JavaScript"}`,
          `${pc.cyan("•")} Renderer:    ${answers.renderer}`,
          `${pc.cyan("•")} Linter:      ${linter === "biome" ? "Biome" : "ESLint"}`,
          `${pc.cyan("•")} Tailwind:    ${tailwind ? "Yes" : "No"}`,
          `${pc.cyan("•")} Components:  ${answers.ui === "swift-rust-ui" ? "swift-rust ui" : answers.ui === "shadcn" ? "shadcn/ui" : "None"}`,
          `${pc.cyan("•")} src/ dir:    ${srcDir ? "Yes (src/app/)" : "No"}`,
          `${pc.cyan("•")} Import as:   ${answers.importAlias}`,
          `${pc.cyan("•")} Install:     ${install ? "Yes" : "No"}`,
        ]
  ).join("\n");

  if (quiet) {
    console.log(`Configuration:\n${summary}`);
  } else {
    p.log.step(`Configuration:\n${summary}`);
    const confirm = await p.confirm({
      message: "Looks good?",
      initialValue: true,
    });
    if (p.isCancel(confirm) || !confirm) {
      p.cancel("Aborted.");
      process.exit(1);
    }
  }

  console.log(`Scaffolding ${pc.cyan(projectName === "." ? "." : projectName)}…`);

  try {
    if (answers.template === "full") {
      await copyTemplate(target, projectName);
    } else {
      await writeProjectFiles(target, answers);
    }
    console.log(`✓ Scaffolded project into ${pc.green(target)}`);

    let installSucceeded = false;
    if (install) {
      console.log("Running bun install…");
      try {
        await runInstall(target);
        console.log("✓ Installed dependencies");
        installSucceeded = true;
      } catch (_err) {
        console.error("Failed to install dependencies. Run `bun install` manually.");
      }
    }

    if (answers.ui === "shadcn" && installSucceeded) {
      console.log("Fetching canonical shadcn components…");
      const ok = await runShadcnAdd(target, SHADCN_DEFAULT_COMPONENTS);
      if (ok) {
        console.log(
          `✓ Added ${SHADCN_DEFAULT_COMPONENTS.length} shadcn components from the registry`,
        );
      } else {
        const cwdArg = projectName === "." ? "." : `./${projectName}`;
        console.log(
          `${pc.yellow("!")} Could not fetch shadcn components from the registry. Using bundled shadcn-style components as a fallback. You can retry later with: ${pc.cyan(`bunx --bun shadcn@latest add ${SHADCN_DEFAULT_COMPONENTS.join(" ")} --cwd ${cwdArg}`)}`,
        );
      }
    } else if (answers.ui === "swift-rust-ui" && installSucceeded) {
      console.log("Adding swift-rust ui components via the CLI…");
      const ok = await runSwiftRustUiAdd(target, SWIFT_RUST_UI_DEFAULTS);
      if (ok) {
        console.log(
          `✓ Added ${SWIFT_RUST_UI_DEFAULTS.length} swift-rust ui components via ${pc.cyan("@swift-rust/ui")}`,
        );
      } else {
        console.log(
          `${pc.yellow("!")} Could not run the ${pc.cyan("@swift-rust/ui")} CLI. Using the bundled components as a fallback. Add more later with: ${pc.cyan("bunx @swift-rust/ui add <component>")}`,
        );
      }
    } else if (answers.ui === "swift-rust-ui") {
      // install was skipped → the bundled components are already in place.
      console.log(
        `✓ Added ${SWIFT_RUST_UI_DEFAULTS.length} swift-rust ui components (${SWIFT_RUST_UI_DEFAULTS.join(", ")}). Add more with ${pc.cyan("bunx @swift-rust/ui add <component>")}.`,
      );
    }

    const next = projectName === "." ? "bun run dev" : `cd ${projectName}\nbun run dev`;
    console.log(`\n${pc.green("Done!")} Next steps:\n${pc.cyan(next)}`);
  } catch (err) {
    console.error("Scaffolding failed:", (err as Error).message);
    process.exit(1);
  }
}

async function listDir(dir: string): Promise<string[]> {
  try {
    const { readdir } = await import("node:fs/promises");
    return await readdir(dir);
  } catch {
    return [];
  }
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
