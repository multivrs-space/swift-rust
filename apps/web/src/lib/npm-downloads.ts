type Daily = { day: string; downloads: number };
type RangeResponse = { downloads?: Daily[]; error?: string };
type RegistryResponse = { time?: { created?: string } };

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 540;
const CACHE_MS = 6 * 60 * 60 * 1000;

export type NpmDownloadStats = {
  total: number;
  week: number;
  weekStart: string;
  weekEnd: string;
};

const cache = new Map<string, { at: number; value: NpmDownloadStats }>();

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function dailyDownloads(name: string, start: Date, end: Date): Promise<Daily[]> {
  const points: Daily[] = [];
  let cursor = utcDate(start);
  const last = utcDate(end);

  while (cursor <= last) {
    const windowEnd = new Date(cursor.getTime() + WINDOW_DAYS * DAY_MS);
    const stop = windowEnd < last ? windowEnd : last;
    const url = `https://api.npmjs.org/downloads/range/${iso(cursor)}:${iso(stop)}/${encodeURIComponent(name)}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`npm downloads ${res.status}`);
    const body = (await res.json()) as RangeResponse;
    if (body.error) throw new Error(body.error);
    points.push(...(body.downloads ?? []));
    cursor = new Date(stop.getTime() + DAY_MS);
  }

  return points;
}

export async function npmDownloadStats(name: string): Promise<NpmDownloadStats | null> {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  try {
    const metaRes = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      headers: { accept: "application/json" },
    });
    if (!metaRes.ok) return hit?.value ?? null;
    const meta = (await metaRes.json()) as RegistryResponse;
    const created = meta.time?.created ? new Date(meta.time.created) : new Date(Date.now() - 30 * DAY_MS);
    const points = await dailyDownloads(name, created, new Date());
    const weekEnd = new Date(utcDate(new Date()).getTime() - DAY_MS);
    const weekStart = new Date(weekEnd.getTime() - 6 * DAY_MS);
    const weekStartIso = iso(weekStart);
    const week = points
      .filter((point) => point.day >= weekStartIso)
      .reduce((sum, point) => sum + point.downloads, 0);
    const value: NpmDownloadStats = {
      total: points.reduce((sum, point) => sum + point.downloads, 0),
      week,
      weekStart: weekStartIso,
      weekEnd: iso(weekEnd),
    };
    cache.set(name, { at: Date.now(), value });
    return value;
  } catch {
    return hit?.value ?? null;
  }
}
