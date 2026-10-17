#!/usr/bin/env bun
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { delimiter, dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import {
  isSupportedBunVersion,
  unsupportedBunMessage,
} from "./runtime/bun-version.mjs";

const here = dirname(realpathSync(fileURLToPath(import.meta.url)));
const packageRoot = resolve(here, "..");
const workspaceRoot = resolve(packageRoot, "../..");
const rawArgs = process.argv.slice(2);
const useNative = process.env.SWIFT_RUST_NATIVE === "1" || rawArgs.includes("--native");
const cleanArgs = rawArgs.filter((a) => a !== "--native");
const cmd = cleanArgs[0] || "help";
const rest = cleanArgs.slice(1);

function findBun() {
  if (process.env.SWIFT_RUST_RUNTIME) return process.env.SWIFT_RUST_RUNTIME;
  if (process.versions && process.versions.bun) {
    return process.execPath;
  }
  const exe = process.platform === "win32" ? "bun.exe" : "bun";
  const candidates = [
    process.env.BUN_INSTALL ? join(process.env.BUN_INSTALL, "bin", exe) : null,
    join(process.env.USERPROFILE || "", ".bun", "bin", exe),
    join(process.env.HOME || "", ".bun", "bin", exe),
    ...String(process.env.PATH || "")
      .split(delimiter)
      .filter(Boolean)
      .map((dir) => join(dir, exe)),
    "/usr/local/bin/bun",
    "/opt/homebrew/bin/bun",
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function checkBun(runtime) {
  const version =
    runtime === process.execPath && process.versions?.bun
      ? process.versions.bun
      : spawnSync(runtime, ["--version"], { encoding: "utf8" }).stdout?.trim();
  if (!isSupportedBunVersion(version)) {
    process.stderr.write(`${unsupportedBunMessage(version)}\n`);
    return false;
  }
  return true;
}

async function runBunScript(script, args, command) {
  const runtime = findBun();
  if (!runtime) {
    process.stderr.write(
      `swift-rust ${command} requires Bun. Install Bun from https://bun.sh and make sure \`bun\` is on PATH.\n`,
    );
    return 1;
  }
  if (!checkBun(runtime)) return 1;
  const env =
    command === "build"
      ? { ...process.env, NODE_ENV: process.env.NODE_ENV || "production" }
      : process.env;
  const child = spawn(runtime, [script, ...args], {
    stdio: "inherit",
    env,
  });
  return await new Promise((resolveExit) => {
    child.on("exit", (code) => resolveExit(code ?? 1));
    child.on("error", (error) => {
      process.stderr.write(
        `swift-rust ${command}: could not start Bun at ${runtime} (${error.message}).\n`,
      );
      resolveExit(1);
    });
  });
}

function getBinaryName() {
  if (process.platform === "win32") return "swift-rust.exe";
  return "swift-rust";
}

function findBinary() {
  const name = getBinaryName();
  const candidates = [
    join(packageRoot, "native", `${process.platform}-${process.arch}`, name),
    join(packageRoot, "native", name),
    join(packageRoot, "bin", name),
    join(workspaceRoot, "target", "release", name),
    join(workspaceRoot, "target", "debug", name),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

const nativeBin = findBinary();

if (nativeBin && (useNative || cmd === "start")) {
  const child = spawn(nativeBin, cleanArgs, { stdio: "inherit", env: process.env });
  const code = await new Promise((r) => {
    child.on("exit", (c) => r(c ?? 1));
    child.on("error", (error) => {
      process.stderr.write(`swift-rust: failed to start native binary ${nativeBin} (${error.message}).\n`);
      r(1);
    });
  });
  process.exit(code);
}

if (cmd === "dev") {
  const code = await runBunScript(join(here, "dev-server.mjs"), process.argv.slice(3), "dev");
  process.exit(code);
}

if (cmd === "build") {
  const code = await runBunScript(join(here, "build.mjs"), process.argv.slice(3), "build");
  process.exit(code);
}

if (cmd === "upgrade" || cmd === "update") {
  const projectDir = process.cwd();
  const args = process.argv.slice(3);

  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(
      `swift-rust upgrade — update swift-rust to the latest release.\n\n` +
        `Usage:\n` +
        `  swift-rust upgrade            update to the latest stable\n` +
        `  swift-rust upgrade <tag>      update to a dist-tag (e.g. canary) or version (e.g. 1.6.0)\n` +
        `  swift-rust upgrade --tag <t>  same, explicit flag\n\n` +
        `Detects your package manager from the lockfile (bun/pnpm/npm/yarn).\n` +
        `The @swift-rust/* packages (font, image, pdf, video, env) update transitively.\n`,
    );
    process.exit(0);
  }

  // Resolve the target tag/version: a bare arg, or --tag <t>, else "latest".
  let target = "latest";
  const tagIdx = args.indexOf("--tag");
  if (tagIdx !== -1 && args[tagIdx + 1]) target = args[tagIdx + 1];
  else {
    const bare = args.find((a) => !a.startsWith("-"));
    if (bare) target = bare;
  }

  // Detect the package manager from the lockfile in the project.
  const pm =
    existsSync(join(projectDir, "bun.lock")) || existsSync(join(projectDir, "bun.lockb"))
      ? "bun"
      : existsSync(join(projectDir, "pnpm-lock.yaml"))
        ? "pnpm"
        : existsSync(join(projectDir, "yarn.lock"))
          ? "yarn"
          : existsSync(join(projectDir, "package-lock.json"))
            ? "npm"
            : "bun";

  const readInstalledVersion = () => {
    try {
      const pkgPath = join(projectDir, "node_modules", "swift-rust", "package.json");
      if (existsSync(pkgPath)) {
        return JSON.parse(readFileSync(pkgPath, "utf8")).version;
      }
    } catch {}
    return null;
  };

  if (!existsSync(join(projectDir, "package.json"))) {
    process.stderr.write("swift-rust upgrade: no package.json here — run this inside your project.\n");
    process.exit(1);
  }

  const before = readInstalledVersion();
  const spec = `swift-rust@${target}`;
  const addArgs = pm === "npm" ? ["install", spec] : ["add", spec];
  process.stdout.write(`↻ Upgrading ${spec} with ${pm}${before ? ` (current: ${before})` : ""}…\n`);

  const child = spawn(pm, addArgs, { stdio: "inherit", cwd: projectDir, env: process.env });
  const code = await new Promise((r) => {
    child.on("exit", (c) => r(c ?? 1));
    child.on("error", (e) => {
      process.stderr.write(`swift-rust upgrade: failed to run ${pm} (${e.message}).\n`);
      r(1);
    });
  });
  if (code === 0) {
    const after = readInstalledVersion();
    if (after && before && after !== before) process.stdout.write(`✓ swift-rust ${before} → ${after}\n`);
    else if (after) process.stdout.write(`✓ swift-rust on ${after}\n`);
    else process.stdout.write(`✓ done — restart your dev server to pick up the new runtime.\n`);
  }
  process.exit(code);
}


function isMonorepo() {
  return existsSync(join(workspaceRoot, "Cargo.toml"));
}

function cargoRun() {
  const child = spawn(
    "cargo",
    ["run", "--release", "-p", "swift-rust", "--bin", "swift-rust", "--", cmd, ...rest],
    { stdio: "inherit", cwd: workspaceRoot, env: process.env },
  );
  return new Promise((resolveExit) => {
    child.on("exit", (c) => resolveExit(c ?? 1));
    child.on("error", (error) => {
      process.stderr.write(`swift-rust: failed to start Cargo (${error.message}).\n`);
      resolveExit(1);
    });
  });
}

const bin = findBinary();
if (bin) {
  const child = spawn(bin, cleanArgs, { stdio: "inherit", env: process.env });
  const code = await new Promise((r) => {
    child.on("exit", (c) => r(c ?? 1));
    child.on("error", (error) => {
      process.stderr.write(`swift-rust: failed to start ${bin} (${error.message}).\n`);
      r(1);
    });
  });
  process.exit(code);
}

if (isMonorepo()) {
  const code = await cargoRun();
  process.exit(code);
}

process.stderr.write(`swift-rust: binary not found. In a monorepo, run \`cargo build --release -p swift-rust\`. In a published package, install should have placed the binary in native/<platform>/.\n`);
process.exit(1);
