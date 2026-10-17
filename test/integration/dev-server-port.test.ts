import { describe, expect, test } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, type Server } from "node:net";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const FIX = join(import.meta.dir, "..", "fixtures", "app");
const DEV = join(ROOT, "packages", "swift-rust", "bin", "dev-server.mjs");

function listen(port: number) {
  return new Promise<Server | null>((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(null));
    server.once("listening", () => resolve(server));
    server.listen(port, "127.0.0.1");
  });
}

function close(server: Server) {
  return new Promise<void>((resolve) => server.close(() => resolve()));
}

async function reserveAdjacentPorts() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const start = 42_000 + Math.floor(Math.random() * 10_000);
    const blocker = await listen(start);
    if (!blocker) continue;
    const next = await listen(start + 1);
    if (next) {
      await close(next);
      return { blocker, start };
    }
    await close(blocker);
  }
  throw new Error("Could not reserve adjacent ports for the test");
}

async function waitForHealth(url: string, process: ChildProcess) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`Dev server exited with code ${process.exitCode}`);
    }
    try {
      const response = await fetch(`${url}/_swift-rust/health`);
      if (response.ok) return response;
    } catch {}
    await Bun.sleep(100);
  }
  throw new Error(`Dev server did not become ready at ${url}`);
}

async function stop(process: ChildProcess) {
  if (process.exitCode !== null) return;
  process.kill("SIGTERM");
  await Promise.race([once(process, "exit"), Bun.sleep(2_000)]);
}

describe("dev server port selection", () => {
  test("uses the next port when the requested port is occupied", async () => {
    const { blocker, start } = await reserveAdjacentPorts();
    let output = "";
    const child = spawn("bun", [DEV, "--hostname", "127.0.0.1"], {
      cwd: FIX,
      env: { ...process.env, PORT: String(start) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      output += chunk.toString();
    });

    try {
      const response = await waitForHealth(`http://127.0.0.1:${start + 1}`, child);
      // biome-ignore lint/suspicious/noControlCharactersInRegex: strip ANSI color codes
      const clean = output.replace(/\u001b\[[0-9;]*m/g, "");
      expect(clean).toContain(`Port ${start} is in use; using ${start + 1} instead.`);
      expect(clean).toContain(`Local:     http://localhost:${start + 1}`);
    } finally {
      await stop(child);
      await close(blocker);
    }
  }, 30_000);
});
