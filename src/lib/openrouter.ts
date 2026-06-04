import type { ORModel, ChatRequest, ChatResponse, ChatMessage } from "./types";
import { getCached, setCache } from "./cache";
import { getConfig } from "./config";

const BASE = "https://openrouter.ai/api/v1";

async function orFetch<T>(path: string, apiKey: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
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

  // Fetch from both endpoints in parallel
  const mainPath = sort ? `/models?sort=${sort}` : '/models';
  const [mainRes, embeddingsRes] = await Promise.all([
    orFetch<{ data: ORModel[] }>(mainPath, apiKey),
    orFetch<{ data: ORModel[] }>("/embeddings/models", apiKey).catch(() => ({ data: [] })),
  ]);

  // Merge and deduplicate by id
  const seen = new Set<string>();
  const models: ORModel[] = [];

  for (const m of [...mainRes.data, ...embeddingsRes.data]) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      models.push(m);
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
  request: ChatRequest
): Promise<ChatResponse> {
  return orFetch<ChatResponse>("/chat/completions", apiKey, {
    method: "POST",
    body: JSON.stringify({ ...request, stream: false }),
  });
}

export async function chatCompletionStream(
  apiKey: string,
  request: ChatRequest
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/or-cli",
      "X-Title": "or-cli",
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

export function combinedPrice(model: ORModel): number {
  const input = parseFloat(model.pricing?.prompt ?? "0") * 1_000_000;
  const output = parseFloat(model.pricing?.completion ?? "0") * 1_000_000;
  // Weighted 3:1 input:output
  return (input * 3 + output) / 4;
}
