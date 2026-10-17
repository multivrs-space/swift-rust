import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const SRC = import.meta.dir;

describe("full-demo structure", () => {
  it("has root directory", () => {
    expect(existsSync(ROOT)).toBe(true);
  });

  it("has src/app directory", () => {
    expect(existsSync(SRC)).toBe(true);
  });

  it("has root layout in app/src", () => {
    expect(existsSync(join(SRC, "layout.tsx"))).toBe(true);
  });

  it("has home page in app/src", () => {
    expect(existsSync(join(SRC, "page.tsx"))).toBe(true);
  });

  it("has dashboard with sidebar layout", () => {
    expect(existsSync(join(SRC, "dashboard", "layout.tsx"))).toBe(true);
    expect(existsSync(join(SRC, "dashboard", "page.tsx"))).toBe(true);
  });

  it("has blog with dynamic [slug] route", () => {
    expect(existsSync(join(SRC, "blog", "page.tsx"))).toBe(true);
    expect(existsSync(join(SRC, "blog", "[slug]", "page.tsx"))).toBe(true);
    expect(existsSync(join(SRC, "blog", "tag", "[tag]", "page.tsx"))).toBe(true);
  });

  it("has API routes", () => {
    expect(existsSync(join(SRC, "api", "health", "route.ts"))).toBe(true);
    expect(existsSync(join(SRC, "api", "posts", "route.ts"))).toBe(true);
    expect(existsSync(join(SRC, "api", "posts", "[id]", "route.ts"))).toBe(true);
  });

  it("has special files (not-found, error, loading)", () => {
    expect(existsSync(join(SRC, "not-found.tsx"))).toBe(true);
    expect(existsSync(join(SRC, "error.tsx"))).toBe(true);
    expect(existsSync(join(SRC, "loading.tsx"))).toBe(true);
  });

  it("has all main sections", () => {
    const required = ["about", "blog", "contact", "dashboard", "fonts", "images", "videos"];
    for (const dir of required) {
      expect(existsSync(join(SRC, dir))).toBe(true);
    }
  });
});
