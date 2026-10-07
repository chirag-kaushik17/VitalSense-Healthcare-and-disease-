const API_BASE = "";
const CACHE_TTL_MS = 30000;
const responseCache = new Map();

export async function get(path, { signal, cache = true } = {}) {
  const url = `${API_BASE}${path}`;
  const cached = responseCache.get(url);
  if (cache && cached && Date.now() - cached.time < CACHE_TTL_MS) return cached.value;

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  const value = await response.json();
  if (cache) responseCache.set(url, { time: Date.now(), value });
  return value;
}

export function invalidate(pathPrefix = "") {
  if (!pathPrefix) {
    responseCache.clear();
    return;
  }
  for (const key of responseCache.keys()) {
    if (key.startsWith(`${API_BASE}${pathPrefix}`)) responseCache.delete(key);
  }
}