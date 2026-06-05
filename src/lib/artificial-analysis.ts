import type { AAModel, AAMediaModel, AAMediaEndpoint } from "./types";
import { getCached, setCache } from "./cache";
import { getConfig } from "./config";
import { apiFetch } from "./fetch";

const BASE = "https://artificialanalysis.ai/api/v2";

// AA rate limit: 1000/day. Cache aggressively.
const AA_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function aaFetch<T>(path: string, apiKey: string): Promise<T> {
  const res = await apiFetch(`${BASE}${path}`, {
    headers: {
      "x-api-key": apiKey,
    },
  });

  if (res.status === 429) {
    throw new Error(
      "Artificial Analysis rate limit exceeded (1000/day).\n" +
      "Cached data will be used if available. Try again tomorrow or clear cache with `or cache clear`."
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AA API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export async function fetchLLMBenchmarks(
  apiKey: string,
  noCache = false
): Promise<AAModel[]> {
  if (!noCache) {
    const cached = getCached<AAModel[]>("aa-llms", {}, AA_CACHE_TTL);
    if (cached) return cached;
  }

  const res = await await aaFetch<{ data: AAModel[] }>("/data/llms/models", apiKey);
  const data = res.data;

  if (!noCache) {
    setCache("aa-llms", {}, data, AA_CACHE_TTL);
  }

  return data;
}

export async function fetchMediaBenchmarks(
  apiKey: string,
  endpoint: AAMediaEndpoint,
  noCache = false
): Promise<AAMediaModel[]> {
  const cacheKey = `aa-media-${endpoint}`;

  if (!noCache) {
    const cached = getCached<AAMediaModel[]>(cacheKey, {}, AA_CACHE_TTL);
    if (cached) return cached;
  }

  const res = await aaFetch<{ data: AAMediaModel[] }>(
    `/data/media/${endpoint}`,
    apiKey
  );
  const data = res.data;

  if (!noCache) {
    setCache(cacheKey, {}, data, AA_CACHE_TTL);
  }

  return data;
}

export function getLLMBenchmarkNames(): string[] {
  return [
    "intelligence_index",
    "coding_index",
    "math_index",
    "mmlu_pro",
    "gpqa",
    "hle",
    "livecodebench",
    "scicode",
    "math_500",
    "aime",
  ];
}

export function formatBenchmarkScore(score: number | undefined, benchmark: string): string {
  if (score === undefined) return "—";
  // Some benchmarks are 0-1, others 0-100
  if (score <= 1) return `${(score * 100).toFixed(1)}%`;
  return score.toFixed(1);
}
