import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, statSync } from "fs";
import { join } from "path";
import { getConfigDir } from "./config";
import { createHash } from "crypto";

const CACHE_DIR = join(getConfigDir(), "cache");

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function cacheKey(namespace: string, params: Record<string, unknown>): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(params))
    .digest("hex")
    .slice(0, 12);
  return `${namespace}_${hash}.json`;
}

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  ttlMs: number;
}

export function getCached<T>(namespace: string, params: Record<string, unknown>, ttlMs: number): T | null {
  ensureCacheDir();
  const file = join(CACHE_DIR, cacheKey(namespace, params));
  if (!existsSync(file)) return null;

  try {
    const raw = readFileSync(file, "utf-8");
    const entry: CacheEntry<T> = JSON.parse(raw);
    const age = Date.now() - entry.cachedAt;
    if (age > entry.ttlMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export function setCache<T>(namespace: string, params: Record<string, unknown>, data: T, ttlMs: number): void {
  ensureCacheDir();
  const file = join(CACHE_DIR, cacheKey(namespace, params));
  const entry: CacheEntry<T> = { data, cachedAt: Date.now(), ttlMs };
  writeFileSync(file, JSON.stringify(entry));
}

export function clearCache(): number {
  ensureCacheDir();
  const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    unlinkSync(join(CACHE_DIR, f));
  }
  return files.length;
}

export function cacheStats(): { count: number; totalSize: number; oldestAge: number | null } {
  ensureCacheDir();
  const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));
  let totalSize = 0;
  let oldestAge: number | null = null;

  for (const f of files) {
    const path = join(CACHE_DIR, f);
    const stat = statSync(path);
    totalSize += stat.size;

    try {
      const raw = readFileSync(path, "utf-8");
      const entry: CacheEntry<unknown> = JSON.parse(raw);
      const age = Date.now() - entry.cachedAt;
      if (oldestAge === null || age > oldestAge) {
        oldestAge = age;
      }
    } catch {
      // skip unreadable
    }
  }

  return { count: files.length, totalSize, oldestAge };
}
