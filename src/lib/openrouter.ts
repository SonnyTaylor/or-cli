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

  // Fetch models in parallel: main list, embeddings, and specialized output modalities
  // The default /models only returns text-output models; we need to explicitly fetch others
  const mainPath = sort ? `/models?sort=${sort}` : '/models';
  const [mainRes, embeddingsRes, imageRes, videoRes, speechRes, audioRes, transcriptionRes, rerankRes] = await Promise.all([
    orFetch<{ data: ORModel[] }>(mainPath, apiKey),
    orFetch<{ data: ORModel[] }>("/embeddings/models", apiKey).catch(() => ({ data: [] })),
    orFetch<{ data: ORModel[] }>("/models?output_modalities=image", apiKey).catch(() => ({ data: [] })),
    orFetch<{ data: ORModel[] }>("/models?output_modalities=video", apiKey).catch(() => ({ data: [] })),
    orFetch<{ data: ORModel[] }>("/models?output_modalities=speech", apiKey).catch(() => ({ data: [] })),
    orFetch<{ data: ORModel[] }>("/models?output_modalities=audio", apiKey).catch(() => ({ data: [] })),
    orFetch<{ data: ORModel[] }>("/models?output_modalities=transcription", apiKey).catch(() => ({ data: [] })),
    orFetch<{ data: ORModel[] }>("/models?output_modalities=rerank", apiKey).catch(() => ({ data: [] })),
  ]);

  // Merge and deduplicate by id
  const seen = new Set<string>();
  const models: ORModel[] = [];

  for (const m of [
    ...mainRes.data,
    ...embeddingsRes.data,
    ...imageRes.data,
    ...videoRes.data,
    ...speechRes.data,
    ...audioRes.data,
    ...transcriptionRes.data,
    ...rerankRes.data,
  ]) {
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

      // Update models with endpoint pricing (merge all endpoint pricing fields)
      for (const result of results) {
        if (result?.pricing) {
          const model = models.find(m => m.id === result.id);
          if (model) {
            model.pricing = {
              ...model.pricing,
              ...result.pricing,
              // Keep model-level prompt/completion if endpoint has zeros but model doesn't
              prompt: model.pricing.prompt !== "0" ? model.pricing.prompt : (result.pricing.prompt ?? "0"),
              completion: model.pricing.completion !== "0" ? model.pricing.completion : (result.pricing.completion ?? "0"),
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
  // Prefer the structured modality arrays; fallback to legacy string
  const input = model.architecture?.input_modalities ?? [];
  const output = model.architecture?.output_modalities ?? [];
  if (input.length || output.length) {
    return `${input.join("+") || "text"}->${output.join("+") || "text"}`;
  }
  return model.architecture?.modality ?? "text->text";
}

export function isTextModel(model: ORModel): boolean {
  const output = model.architecture?.output_modalities ?? [];
  const input = model.architecture?.input_modalities ?? [];
  if (output.length || input.length) {
    return output.includes("text") && !input.includes("image") && !input.includes("audio") && !input.includes("video");
  }
  // Fallback to legacy string parsing
  const mod = getModelModality(model);
  const [inStr, outStr] = mod.split("->");
  return (outStr?.includes("text") ?? false) && !(inStr?.includes("image") ?? false) && !(inStr?.includes("audio") ?? false);
}

export function isVisionModel(model: ORModel): boolean {
  const input = model.architecture?.input_modalities ?? [];
  const output = model.architecture?.output_modalities ?? [];
  if (input.length || output.length) {
    return input.includes("image") && output.includes("text");
  }
  // Fallback to legacy string parsing
  const mod = getModelModality(model);
  const [inStr, outStr] = mod.split("->");
  return (inStr?.includes("image") ?? false) && (outStr?.includes("text") ?? false);
}

export function isImageGenModel(model: ORModel): boolean {
  const output = model.architecture?.output_modalities ?? [];
  if (output.length) {
    return output.includes("image");
  }
  // Fallback to legacy string parsing
  const mod = getModelModality(model);
  return mod.includes("->image") || mod.includes("+image");
}

export function isEmbeddingModel(model: ORModel): boolean {
  const output = model.architecture?.output_modalities ?? [];
  if (output.length) {
    return output.includes("embeddings");
  }
  const mod = getModelModality(model);
  return mod.includes("embedding") || mod.includes("embeddings") || model.id.includes("embed");
}

export function isRerankModel(model: ORModel): boolean {
  const output = model.architecture?.output_modalities ?? [];
  if (output.length) {
    return output.includes("rerank");
  }
  const mod = getModelModality(model);
  return mod.includes("rerank") || model.id.includes("rerank");
}

export function isImageEditModel(model: ORModel): boolean {
  const input = model.architecture?.input_modalities ?? [];
  const output = model.architecture?.output_modalities ?? [];
  if (input.length || output.length) {
    return input.includes("image") && output.includes("image");
  }
  const mod = getModelModality(model);
  return mod.includes("image->image") || mod.includes("image+image->image");
}

export function isTranscriptionModel(model: ORModel): boolean {
  const output = model.architecture?.output_modalities ?? [];
  const input = model.architecture?.input_modalities ?? [];
  if (output.length || input.length) {
    return output.includes("transcription") || (input.includes("audio") && output.includes("text") && model.id.includes("whisper"));
  }
  const mod = getModelModality(model);
  const [inStr, outStr] = mod.split("->");
  return (
    mod.includes("transcription") ||
    model.id.includes("whisper") ||
    model.id.includes("transcri") ||
    ((inStr?.includes("audio") ?? false) && (outStr?.includes("text") ?? false))
  );
}

export function isAudioModel(model: ORModel): boolean {
  const output = model.architecture?.output_modalities ?? [];
  const input = model.architecture?.input_modalities ?? [];
  if (output.length || input.length) {
    return output.includes("audio") || input.includes("audio") || output.includes("speech");
  }
  const mod = getModelModality(model);
  const [inStr, outStr] = mod.split("->");
  return (outStr?.includes("audio") ?? false) || (inStr?.includes("audio") ?? false);
}

export function isAudioGenModel(model: ORModel): boolean {
  const output = model.architecture?.output_modalities ?? [];
  if (output.length) {
    return output.includes("audio") || output.includes("speech");
  }
  const mod = getModelModality(model);
  return mod.includes("->audio") || mod.includes("+audio") || mod.includes("->speech") || mod.includes("+speech");
}

export function isVideoModel(model: ORModel): boolean {
  const output = model.architecture?.output_modalities ?? [];
  const input = model.architecture?.input_modalities ?? [];
  if (output.length || input.length) {
    return output.includes("video") || input.includes("video");
  }
  const mod = getModelModality(model);
  const [inStr, outStr] = mod.split("->");
  return (outStr?.includes("video") ?? false) || (inStr?.includes("video") ?? false);
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
  
  // For image gen models with per-image-token pricing and zero token pricing
  const imgOut = parseFloat(model.pricing?.image_output ?? "0") || parseFloat(model.pricing?.image_token ?? "0");
  if (imgOut > 0 && input === 0 && output === 0) {
    return imgOut * 4096 * 1_000_000; // Return per 1M images (for sorting consistency)
  }
  
  // For models with per-image input pricing and zero token pricing
  const imagePrice = parseFloat(model.pricing?.image ?? "0");
  if (imagePrice > 0 && input === 0 && output === 0) {
    return imagePrice * 1_000_000; // Return per 1M image inputs
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

export async function rerank(apiKey: string, request: import("./types").RerankRequest): Promise<import("./types").RerankResponse> {
  return orFetch<import("./types").RerankResponse>("/rerank", apiKey, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function isSpeechModel(model: ORModel): boolean {
  const output = model.architecture?.output_modalities ?? [];
  if (output.length) {
    return output.includes("speech");
  }
  return model.id.includes("tts") || model.id.includes("speech") || getModelModality(model).includes("speech");
}

export function getPerImagePrice(model: ORModel): number | null {
  const imagePrice = parseFloat(model.pricing?.image ?? "0");
  if (imagePrice > 0) {
    return imagePrice; // Price per image token
  }
  return null;
}

/**
 * Determine the primary price to display for a model in table listings.
 * Picks the most relevant pricing dimension based on model modality.
 * Returns { display: human-readable string, sortValue: number for sorting }.
 */
function fmtTokenPrice(n: number, suffix: string): { display: string; sortValue: number } {
  const perM = n * 1_000_000;
  if (perM === 0) return { display: "free", sortValue: 0 };
  const disp = perM < 0.01 ? `<$0.01/M ${suffix}` : `$${perM.toFixed(2)}/M ${suffix}`;
  return { display: disp, sortValue: perM };
}

function fmtReqPrice(n: number): { display: string; sortValue: number } {
  if (n === 0) return { display: "free", sortValue: 0 };
  const disp = n < 0.0001 ? "<$0.0001/req" : n < 0.01 ? `$${n.toFixed(4)}/req` : `$${n.toFixed(2)}/req`;
  return { display: disp, sortValue: n };
}

function fmtImgPrice(n: number): { display: string; sortValue: number } {
  if (n === 0) return { display: "free", sortValue: 0 };
  // image_output / image_token are price per image token.
  // 4096 image tokens = 1 megapixel (16×16 pixel grid cells).
  // Multiply by 4096 to get per-megapixel (≈ per-image for standard sizes).
  const perMP = n * 4096;
  if (perMP < 0.01) return { display: "<$0.01/img", sortValue: perMP };
  return { display: `$${perMP.toFixed(2)}/img`, sortValue: perMP };
}

import { PRICING_FALLBACKS } from "./pricing-fallbacks";

export function getPrimaryPrice(model: ORModel): { display: string; sortValue: number } {
  const p = model.pricing;
  const prompt = parseFloat(p.prompt ?? "0");
  const completion = parseFloat(p.completion ?? "0");

  // ── 1. Live API pricing (always preferred) ──────────────────────────

  // Rerankers: per-request pricing
  if (isRerankModel(model)) {
    const req = parseFloat(p.request ?? "0");
    if (req > 0) return fmtReqPrice(req);
  }

  // Image generation
  if (isImageGenModel(model)) {
    if (p.image_output && parseFloat(p.image_output) > 0) return fmtImgPrice(parseFloat(p.image_output));
    if (p.image_token && parseFloat(p.image_token) > 0) return fmtImgPrice(parseFloat(p.image_token));
    const img = parseFloat(p.image ?? "0");
    if (img > 0 && prompt === 0 && completion === 0) return fmtImgPrice(img);
    if (completion > 0) return fmtTokenPrice(completion, "out");
    if (prompt > 0) return fmtTokenPrice(prompt, "in");
  }

  // Speech / TTS / Music
  if (isSpeechModel(model) || isAudioGenModel(model)) {
    if (prompt > 0) return fmtTokenPrice(prompt, "in");
    if (p.audio_output && parseFloat(p.audio_output) > 0) return fmtTokenPrice(parseFloat(p.audio_output), "audio");
    if (p.audio && parseFloat(p.audio) > 0) return fmtTokenPrice(parseFloat(p.audio), "audio");
    const req = parseFloat(p.request ?? "0");
    if (req > 0) return fmtReqPrice(req);
  }

  // Transcription
  if (isTranscriptionModel(model)) {
    if (p.audio && parseFloat(p.audio) > 0) return fmtTokenPrice(parseFloat(p.audio), "audio");
    if (prompt > 0) {
      if (prompt < 0.0001) return fmtTokenPrice(prompt, "audio"); // OpenAI per-token
      const disp = prompt < 0.01 ? `<$0.01/min` : `$${prompt.toFixed(3)}/min`; // per-minute
      return { display: disp, sortValue: prompt };
    }
    const req = parseFloat(p.request ?? "0");
    if (req > 0) return fmtReqPrice(req);
  }

  // Video models
  if (isVideoModel(model)) {
    if (completion > 0) return fmtTokenPrice(completion, "out");
    if (prompt > 0) return fmtTokenPrice(prompt, "in");
    const req = parseFloat(p.request ?? "0");
    if (req > 0) return fmtReqPrice(req);
  }

  // Embedding models
  if (isEmbeddingModel(model)) {
    if (prompt > 0) return fmtTokenPrice(prompt, "in");
    if (p.audio && parseFloat(p.audio) > 0) return fmtTokenPrice(parseFloat(p.audio), "audio");
  }

  // Default: text/vision/chat models
  if (prompt > 0 || completion > 0) {
    if (prompt > 0 && completion === 0) return fmtTokenPrice(prompt, "in");
    if (completion > 0 && prompt === 0) return fmtTokenPrice(completion, "out");
    const cp = (prompt * 3 + completion) / 4 * 1_000_000;
    if (cp > 0) return { display: `$${cp.toFixed(2)}/M`, sortValue: cp };
  }

  if (p.audio && parseFloat(p.audio) > 0) return fmtTokenPrice(parseFloat(p.audio), "audio");
  const req = parseFloat(p.request ?? "0");
  if (req > 0) return fmtReqPrice(req);

  // ── 2. Hardcoded fallback (API returns zeros / omits pricing) ───────
  const fallback = PRICING_FALLBACKS[model.id];
  if (fallback) return { display: fallback.value, sortValue: fallback.sortValue };

  // ── 3. Generic placeholders (don't falsely claim "free") ────────────
  if (isRerankModel(model))    return { display: "per-request", sortValue: Infinity };
  if (isVideoModel(model))     return { display: "per-second",  sortValue: Infinity };

  return { display: "free", sortValue: 0 };
}
