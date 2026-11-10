type Daily = { day: string; downloads: number };
type RangeResponse = { downloads?: Daily[]; error?: string };
type RegistryResponse = { time?: { created?: string } };

const DAY_MS = 86_400_000;
/** npm's downloads API rejects range queries wider than 18 months. */
const MAX_RANGE_DAYS = 540;
/** In-process TTL. The CDN (`s-maxage`) and the browser island are the other layers. */
const CACHE_MS = 10 * 60 * 1000;
const WEEK_DAYS = 7;
const REQUEST_TIMEOUT_MS = 8_000;

export type NpmDownloadStats = {
  /** Lifetime downloads, summed from the package's first publish day. */
  total: number;
  /** Downloads across the last 7 complete (UTC) days. */
  week: number;
  weekStart: string;
  weekEnd: string;
  /** ISO timestamp of the moment these numbers were read from npm. */
  updatedAt: string;
};

type CacheEntry = { at: number; value: NpmDownloadStats };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<NpmDownloadStats | null>>();

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

async function getJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // No `cache` option: the TTL above is the only cache we want, and Bun's
    // fetch does not implement the HTTP cache modes anyway.
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** First publish date of the package, so "total" covers its whole life. */
async function packageCreatedAt(name: string): Promise<Date> {
  const meta = await getJson<RegistryResponse>(
    `https://registry.npmjs.org/${encodeURIComponent(name)}`,
  );
  const created = meta?.time?.created ? new Date(meta.time.created) : null;
  if (created && !Number.isNaN(created.getTime())) return utcDate(created);
  // Conservative fallback: npm silently clamps the window to the real publish date.
  return utcDate(addDays(new Date(), -MAX_RANGE_DAYS));
}

async function dailyDownloads(name: string, start: Date, end: Date): Promise<Daily[]> {
  const points: Daily[] = [];
  let cursor = utcDate(start);
  const last = utcDate(end);

  while (cursor <= last) {
    const windowEnd = addDays(cursor, MAX_RANGE_DAYS);
    const stop = new Date(Math.min(windowEnd.getTime(), last.getTime()));
    const url = `https://api.npmjs.org/downloads/range/${iso(cursor)}:${iso(stop)}/${encodeURIComponent(name)}`;
    const body = await getJson<RangeResponse>(url);
    if (!body) throw new Error(`npm downloads range failed for ${iso(cursor)}:${iso(stop)}`);
    if (body.error) throw new Error(body.error);
    points.push(...(body.downloads ?? []));
    cursor = addDays(stop, 1);
  }

  return points;
}

function summarise(points: Daily[]): NpmDownloadStats {
  const today = utcDate(new Date());
  // "This week" = the last 7 days that npm has already finished counting.
  const weekEnd = addDays(today, -1);
  const weekStart = addDays(weekEnd, -(WEEK_DAYS - 1));
  const weekStartIso = iso(weekStart);
  const weekEndIso = iso(weekEnd);

  return {
    total: points.reduce((sum, point) => sum + point.downloads, 0),
    week: points
      .filter((point) => point.day >= weekStartIso && point.day <= weekEndIso)
      .reduce((sum, point) => sum + point.downloads, 0),
    weekStart: weekStartIso,
    weekEnd: weekEndIso,
    updatedAt: new Date().toISOString(),
  };
}

async function load(name: string): Promise<NpmDownloadStats | null> {
  try {
    const created = await packageCreatedAt(name);
    const points = await dailyDownloads(name, created, new Date());
    if (points.length === 0) return cache.get(name)?.value ?? null;
    const value = summarise(points);
    cache.set(name, { at: Date.now(), value });
    return value;
  } catch {
    // Network hiccup: serve the last known good numbers rather than nothing.
    return cache.get(name)?.value ?? null;
  }
}

/**
 * Live npm download stats, cached in-process for a few minutes and de-duplicated
 * so concurrent requests share a single upstream round-trip.
 *
 * Returns null when npm is unreachable and nothing has been cached yet.
 */
export async function npmDownloadStats(name: string): Promise<NpmDownloadStats | null> {
  const key = name.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = load(key).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

/** Last value read for `name`, ignoring TTL. Used for build-time fallback markup. */
export function cachedNpmDownloadStats(name: string): NpmDownloadStats | null {
  return cache.get(name.trim().toLowerCase())?.value ?? null;
}

/** Test/HMR helper. */
export function clearNpmDownloadCache(): void {
  cache.clear();
  inFlight.clear();
}
