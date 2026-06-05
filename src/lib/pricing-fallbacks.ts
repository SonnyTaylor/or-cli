// Hardcoded pricing fallbacks for models the OpenRouter API under-reports.
// These are ONLY used when live API pricing fields are all zero/empty.
// Keep this file updated when OpenRouter fixes their API.

export interface FallbackPrice {
  label: string;     // e.g. "Request", "Song", "Video"
  value: string;     // human display: "$0.0025/search"
  sortValue: number; // numeric for sorting/filtering
}

export const PRICING_FALLBACKS: Record<string, FallbackPrice> = {
  // ── Rerankers ──
  "cohere/rerank-4-pro":     { label: "Request", value: "$0.0025/search", sortValue: 0.0025 },
  "cohere/rerank-4-fast":    { label: "Request", value: "$0.002/search",  sortValue: 0.002 },
  "cohere/rerank-v3.5":      { label: "Request", value: "$0.001/search",  sortValue: 0.001 },

  // ── Music ──
  "google/lyria-3-pro-preview":  { label: "Request", value: "$0.08/song", sortValue: 0.08 },
  "google/lyria-3-clip-preview": { label: "Request", value: "$0.04/song", sortValue: 0.04 },

  // ── Video (per-second) ──
  "google/veo-3.1":              { label: "Request", value: "$0.40/sec",    sortValue: 0.40 },
  "google/veo-3.1-fast":         { label: "Request", value: "$0.10/sec",    sortValue: 0.10 },
  "google/veo-3.1-lite":         { label: "Request", value: "$0.05/sec",    sortValue: 0.05 },
  "x-ai/grok-imagine-video":     { label: "Request", value: "$0.05/sec",    sortValue: 0.05 },
  "openai/sora-2-pro":           { label: "Request", value: "$0.30/sec",    sortValue: 0.30 },
  "kwaivgi/kling-v3.0-pro":      { label: "Request", value: "$0.168/sec",   sortValue: 0.168 },
  "kwaivgi/kling-v3.0-std":      { label: "Request", value: "$0.126/sec",   sortValue: 0.126 },
  "bytedance/seedance-2.0":      { label: "Request", value: "$0.06726/sec", sortValue: 0.06726 },
  "bytedance/seedance-2.0-fast": { label: "Request", value: "$0.0538/sec",  sortValue: 0.0538 },
  "bytedance/seedance-1-5-pro":  { label: "Request", value: "$0.02306/sec", sortValue: 0.02306 },
  "alibaba/wan-2.7":             { label: "Request", value: "$0.10/sec",    sortValue: 0.10 },
  "alibaba/wan-2.6":             { label: "Request", value: "$0.04/sec",    sortValue: 0.04 },
};
