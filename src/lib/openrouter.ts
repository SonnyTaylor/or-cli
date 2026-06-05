import type { ORModel, ChatRequest, ChatResponse, ChatMessage } from "./types";
import { getCached, setCache } from "./cache";
import { getConfig } from "./config";
import { apiFetch } from "./fetch";

const BASE = "https://openrouter.ai/api/v1";

async function orFetch<T>(path: string, apiKey: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/or-cli",
      "X-Title": "or-cli",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export async function fetchModels(apiKey: string, noCache = false, sort?: string): Promise<ORModel[]> {
  const cacheTtl = getConfig().cacheTtlMs;
  const cacheKey = sort ? `or-models-${sort}` : 'or-models';

  if (!noCache) {
    const cached = getCached<ORModel[]>(cacheKey, {}, cacheTtl);
    if (cached) return cached;
  }

  // Fetch models in parallel: main list, embeddings, and image models
  const mainPath = sort ? `/models?sort=${sort}` : '/models';
  const [mainRes, embeddingsRes, imageRes] = await Promise.all([
    orFetch<{ data: ORModel[] }>(mainPath, apiKey),
    orFetch<{ data: ORModel[] }>("/embeddings/models", apiKey).catch(() => ({ data: [] })),
    orFetch<{ data: ORModel[] }>("/models?output_modalities=image", apiKey).catch(() => ({ data: [] })),
  ]);

  // Merge and deduplicate by id
  const seen = new Set<string>();
  const models: ORModel[] = [];

  for (const m of [...mainRes.data, ...embeddingsRes.data, ...imageRes.data]) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      models.push(m);
    }
  }

  // For image models with zero token pricing, fetch endpoints for per-image pricing
  const zeroPricedImage = models.filter(m => {
    const mod = m.architecture?.modality || "";
    const output = mod.split("->")[1] || "";
    return output.includes("image") && 
           parseFloat(m.pricing?.prompt || "0") === 0 && 
           parseFloat(m.pricing?.completion || "0") === 0 &&
           !m.pricing?.image; // Don't re-fetch if already has image pricing
  });

  if (zeroPricedImage.length > 0) {
    // Fetch endpoints in batches of 5
    for (let i = 0; i < zeroPricedImage.length; i += 5) {
      const batch = zeroPricedImage.slice(i, i + 5);
      const results = await Promise.all(
        batch.map(async (m) => {
          try {
            const res = await apiFetch(`${BASE}/models/${m.id}/endpoints`, {
              headers: { Authorization: `Bearer ${apiKey}` },
            });
            if (!res.ok) return null;
            const data = await res.json() as any;
            const endpoints = data.data?.endpoints ?? [];
            if (endpoints.length === 0) return null;
            return { id: m.id, pricing: endpoints[0]?.pricing };
          } catch {
            return null;
          }
        })
      );

      // Update models with endpoint pricing
      for (const result of results) {
        if (result?.pricing) {
          const model = models.find(m => m.id === result.id);
          if (model) {
            model.pricing = {
              ...model.pricing,
              image: result.pricing.image_output || result.pricing.image,
            };
          }
        }
      }
    }
  }

  if (!noCache) {
    setCache(cacheKey, {}, models, cacheTtl);
  }

  return models;
}

export async function fetchModel(apiKey: string, modelId: string): Promise<ORModel | null> {
  const models = await fetchModels(apiKey);
  return models.find((m) => m.id === modelId) ?? null;
}

export async function chatCompletion(
  apiKey: string,
  request: ChatRequest,
  extraHeaders?: Record<string, string>
): Promise<ChatResponse> {
  return orFetch<ChatResponse>("/chat/completions", apiKey, {
    method: "POST",
    body: JSON.stringify({ ...request, stream: false }),
    headers: extraHeaders,
  });
}

export async function chatCompletionStream(
  apiKey: string,
  request: ChatRequest,
  extraHeaders?: Record<string, string>
): Promise<ReadableStream<Uint8Array>> {
  const res = await apiFetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/or-cli",
      "X-Title": "or-cli",
      ...extraHeaders,
    },
    body: JSON.stringify({ ...request, stream: true }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter API error ${res.status}: ${body}`);
  }

  return res.body!;
}

export function modelMatchesSearch(model: ORModel, query: string): boolean {
  const q = query.toLowerCase();
  return (
    model.id.toLowerCase().includes(q) ||
    model.name.toLowerCase().includes(q) ||
    (model.description?.toLowerCase().includes(q) ?? false)
  );
}

export function getModelModality(model: ORModel): string {
  return model.architecture?.modality ?? "text->text";
}

export function isTextModel(model: ORModel): boolean {
  const mod = getModelModality(model);
  // Output is text, input is text-only
  const [input, output] = mod.split("->");
  return output?.includes("text") && !input?.includes("image") && !input?.includes("audio");
}

export function isVisionModel(model: ORModel): boolean {
  const mod = getModelModality(model);
  // Accepts image input but outputs text
  const [input, output] = mod.split("->");
  return (input?.includes("image") ?? false) && (output?.includes("text") ?? false);
}

export function isImageGenModel(model: ORModel): boolean {
  const mod = getModelModality(model);
  // Output includes image (text->image or text+image->image)
  const [input, output] = mod.split("->");
  return output?.includes("image") ?? false;
}

export function isEmbeddingModel(model: ORModel): boolean {
  const mod = getModelModality(model);
  return mod.includes("embedding") || mod.includes("embeddings") || model.id.includes("embed");
}

export function isRerankModel(model: ORModel): boolean {
  const mod = getModelModality(model);
  return mod.includes("rerank") || model.id.includes("rerank");
}

export function isTranscriptionModel(model: ORModel): boolean {
  const mod = getModelModality(model);
  return mod.includes("transcription") || model.id.includes("whisper") || model.id.includes("transcri");
}

export function isAudioModel(model: ORModel): boolean {
  const mod = getModelModality(model);
  const [input, output] = mod.split("->");
  // Audio generation: output includes audio
  // Audio input (STT): input includes audio
  return (output?.includes("audio") ?? false) || (input?.includes("audio") ?? false);
}

export function isAudioGenModel(model: ORModel): boolean {
  const mod = getModelModality(model);
  const output = mod.split("->")[1];
  return output?.includes("audio") ?? false;
}

export function isVideoModel(model: ORModel): boolean {
  const mod = getModelModality(model);
  const [input, output] = mod.split("->");
  // Video generation would have video in output
  // Video understanding has video in input
  return (output?.includes("video") ?? false) || (input?.includes("video") ?? false);
}

export function hasTools(model: ORModel): boolean {
  return model.supported_parameters?.includes("tools") ?? false;
}

export function hasReasoning(model: ORModel): boolean {
  const params = model.supported_parameters ?? [];
  return (
    params.includes("reasoning") ||
    params.includes("include_reasoning") ||
    model.id.includes("o1") ||
    model.id.includes("o3") ||
    model.id.includes("r1") ||
    model.id.includes("qwq") ||
    model.id.includes("deepseek-r")
  );
}

/**
 * Find the OpenRouter model ID matching an Artificial Analysis model name.
 * Returns the OR model ID or null if no match found.
 */
export function findORModelForAA(
  aaName: string,
  aaCreator: string,
  orModels: ORModel[],
  modality?: "image" | "text"
): string | null {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const aaNorm = normalize(aaName);
  const creatorNorm = normalize(aaCreator);

  // Filter by modality first
  const candidates = modality
    ? orModels.filter((m) => {
        if (modality === "image") return isImageGenModel(m);
        if (modality === "text") return isTextModel(m);
        return true;
      })
    : orModels;

  // Try exact ID match first (e.g. "google/gemini-3.1-flash-image-preview")
  for (const m of candidates) {
    if (normalize(m.id) === aaNorm) return m.id;
  }

  // Try matching by key tokens
  // Extract tokens from AA name: "Nano Banana 2 (Gemini 3.1 Flash Image)" -> ["nano", "banana", "gemini", "31", "flash", "image"]
  const aaTokens = aaName.toLowerCase().match(/[a-z]+|\d+/g) ?? [];
  const creatorTokens = aaCreator.toLowerCase().match(/[a-z]+/g) ?? [];

  // Score each candidate
  let bestMatch: { id: string; score: number } | null = null;

  for (const m of candidates) {
    const orId = m.id.toLowerCase();
    const orName = m.name.toLowerCase();
    let score = 0;

    // Creator match (e.g. "google" in "google/gemini-...")
    for (const ct of creatorTokens) {
      if (orId.includes(ct) || orName.includes(ct)) score += 2;
    }

    // Key model family matches
    const families = ["gemini", "gpt", "llama", "mistral", "claude", "qwen", "deepseek", "phi", "command", "flux", "dall", "stable", "midjourney", "grok"];
    for (const family of families) {
      if (aaNorm.includes(family) && (orId.includes(family) || orName.includes(family))) {
        score += 5;
      }
    }

    // Version number matches (e.g. "31" in both)
    const versionTokens = aaTokens.filter((t) => /^\d+$/.test(t));
    for (const vt of versionTokens) {
      if (orId.includes(vt) || orName.includes(vt)) score += 3;
    }

    // Capability matches (flash, pro, mini, image, etc.)
    const caps = ["flash", "pro", "mini", "max", "ultra", "large", "small", "nano", "image", "vision", "turbo", "instruct", "preview"];
    for (const cap of caps) {
      if (aaNorm.includes(cap) && (orId.includes(cap) || orName.includes(cap))) {
        score += 2;
      }
    }

    // Penalize if creator doesn't match at all
    const hasCreatorMatch = creatorTokens.some((ct) => orId.includes(ct) || orName.includes(ct));
    if (!hasCreatorMatch) score -= 5;

    if (score >= 5 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { id: m.id, score };
    }
  }

  return bestMatch?.id ?? null;
}

export function combinedPrice(model: ORModel): number {
  const input = parseFloat(model.pricing?.prompt ?? "0") * 1_000_000;
  const output = parseFloat(model.pricing?.completion ?? "0") * 1_000_000;
  
  // For models with per-image pricing and zero token pricing
  const imagePrice = parseFloat(model.pricing?.image ?? "0");
  if (imagePrice > 0 && input === 0 && output === 0) {
    return imagePrice * 1_000_000; // Return per 1M image tokens
  }
  
  // Weighted 3:1 input:output
  return (input * 3 + output) / 4;
}

export function isPerImagePriced(model: ORModel): boolean {
  const imagePrice = parseFloat(model.pricing?.image ?? "0");
  const input = parseFloat(model.pricing?.prompt ?? "0");
  const output = parseFloat(model.pricing?.completion ?? "0");
  return imagePrice > 0 && input === 0 && output === 0;
}

export function getPerImagePrice(model: ORModel): number | null {
  const imagePrice = parseFloat(model.pricing?.image ?? "0");
  if (imagePrice > 0) {
    return imagePrice; // Price per image token
  }
  return null;
}
