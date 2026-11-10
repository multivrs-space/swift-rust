import { afterEach, beforeEach, describe, expect, it, setSystemTime } from "bun:test";
import { clearNpmDownloadCache, npmDownloadStats } from "@/lib/npm-downloads";

const realFetch = globalThis.fetch;

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgo(n: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - n * 86_400_000,
  );
}

/** npm registry + downloads API stub: `perDay` downloads on every day since `created`. */
function stubNpm(perDay: number, created: Date) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);

    if (url.includes("registry.npmjs.org")) {
      return Response.json({ time: { created: created.toISOString() } });
    }

    if (url.includes("api.npmjs.org/downloads/range/")) {
      const [, range = ""] = url.match(/range\/([^/]+)\//) ?? [];
      const [start = "", end = ""] = range.split(":");
      const downloads: { day: string; downloads: number }[] = [];
      for (
        let d = new Date(`${start}T00:00:00Z`);
        iso(d) <= end;
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        downloads.push({ day: iso(d), downloads: perDay });
      }
      return Response.json({ start, end, package: "swift-rust", downloads });
    }

    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return calls;
}

function goOffline() {
  globalThis.fetch = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
}

describe("npmDownloadStats", () => {
  beforeEach(() => {
    clearNpmDownloadCache();
  });

  afterEach(() => {
    setSystemTime();
    globalThis.fetch = realFetch;
    clearNpmDownloadCache();
  });

  it("sums lifetime downloads and the last 7 complete days", async () => {
    stubNpm(2, daysAgo(30));

    const stats = await npmDownloadStats("swift-rust");

    expect(stats).not.toBeNull();
    // Created 30 days ago → 31 counted days (including today) at 2 downloads/day.
    expect(stats?.total).toBe(62);
    expect(stats?.week).toBe(14);
    // "This week" stops at yesterday: npm has not finished counting today yet.
    expect(stats?.weekEnd).toBe(iso(daysAgo(1)));
    expect(stats?.weekStart).toBe(iso(daysAgo(7)));
  });

  it("serves the cached value without a second round-trip", async () => {
    const calls = stubNpm(1, daysAgo(3));

    const first = await npmDownloadStats("swift-rust");
    const second = await npmDownloadStats("swift-rust");

    expect(second).toEqual(first);
    expect(calls.length).toBe(2); // one registry call + one range call
  });

  it("de-duplicates concurrent callers into a single round-trip", async () => {
    const calls = stubNpm(1, daysAgo(3));

    const [a, b] = await Promise.all([
      npmDownloadStats("swift-rust"),
      npmDownloadStats("swift-rust"),
    ]);

    expect(a).toEqual(b);
    expect(calls.length).toBe(2);
  });

  it("returns null when npm is unreachable and nothing is cached", async () => {
    goOffline();

    expect(await npmDownloadStats("swift-rust")).toBeNull();
  });

  it("keeps serving the last good value after the TTL expires and npm goes down", async () => {
    stubNpm(3, daysAgo(1));
    const good = await npmDownloadStats("swift-rust");
    expect(good).not.toBeNull();

    // Jump past the 10-minute TTL, then take the network away.
    setSystemTime(new Date(Date.now() + 11 * 60 * 1000));
    goOffline();

    expect(await npmDownloadStats("swift-rust")).toEqual(good);
  });

  it("normalises the package name when caching", async () => {
    const calls = stubNpm(1, daysAgo(2));

    await npmDownloadStats("SWIFT-Rust ");
    await npmDownloadStats("swift-rust");

    expect(calls.length).toBe(2);
  });
});
