import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve, extname, dirname } from "path";
import chalk from "chalk";
import ora from "ora";
import type {
  ChatContentPart,
  ChatMessage,
  ChatRequest,
  ChatResponse,
} from "./types";
import { chatCompletion, chatCompletionStream, fetchModels } from "./openrouter";
import { formatNetworkError } from "./fetch";
import { appendHistory, generateId } from "./history";
import { formatDollars } from "./format";

// ── MIME type mappings ───────────────────────────────────────────────────────

export const IMAGE_EXTS: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};

export const AUDIO_EXTS: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".webm": "audio/webm",
};

export const VIDEO_EXTS: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
};

export const PDF_EXTS: Record<string, string> = {
  ".pdf": "application/pdf",
};

// ── File helpers ─────────────────────────────────────────────────────────────

export function fileToBase64(filePath: string): string {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const buffer = readFileSync(absPath);
  return buffer.toString("base64");
}

export function getMimeType(
  filePath: string,
  extMap: Record<string, string>,
  fallback: string
): string {
  const ext = extname(filePath).toLowerCase();
  return extMap[ext] ?? fallback;
}

// ── Content parts builder ────────────────────────────────────────────────────

export interface MultimodalInputs {
  images?: string[];
  audio?: string;
  video?: string;
  pdf?: string;
}

export function buildContentParts(
  message: string,
  inputs: MultimodalInputs
): ChatContentPart[] {
  const parts: ChatContentPart[] = [];

  // Images
  for (const imgPath of inputs.images ?? []) {
    const base64 = fileToBase64(imgPath);
    const mime = getMimeType(imgPath, IMAGE_EXTS, "image/jpeg");
    parts.push({
      type: "image_url",
      image_url: { url: `data:${mime};base64,${base64}` },
    });
  }

  // Audio
  if (inputs.audio) {
    const base64 = fileToBase64(inputs.audio);
    const ext = extname(inputs.audio).toLowerCase().slice(1);
    parts.push({
      type: "input_audio",
      input_audio: { data: base64, format: ext || "wav" },
    });
  }

  // Video
  if (inputs.video) {
    const base64 = fileToBase64(inputs.video);
    const mime = getMimeType(inputs.video, VIDEO_EXTS, "video/mp4");
    parts.push({
      type: "video_url",
      video_url: { url: `data:${mime};base64,${base64}` },
    });
  }

  // PDF
  if (inputs.pdf) {
    const rawPdf = inputs.pdf;
    if (rawPdf.startsWith("http://") || rawPdf.startsWith("https://")) {
      parts.push({
        type: "file",
        file: {
          filename: rawPdf.split("/").pop() || "document.pdf",
          file_data: rawPdf,
        },
      });
    } else {
      const pdfPath = resolve(rawPdf);
      if (!existsSync(pdfPath)) {
        throw new Error(`PDF not found: ${rawPdf}`);
      }
      const base64 = readFileSync(pdfPath).toString("base64");
      parts.push({
        type: "file",
        file: {
          filename: pdfPath.split(/[\\/]/).pop() || "document.pdf",
          file_data: `data:application/pdf;base64,${base64}`,
        },
      });
    }
  }

  // Text always last
  parts.push({ type: "text", text: message });

  return parts;
}

// ── Messages builder ─────────────────────────────────────────────────────────

export function buildMessages(
  contentParts: ChatContentPart[],
  systemPrompt?: string,
  historyMsgs?: ChatMessage[]
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  if (historyMsgs) {
    messages.push(...historyMsgs);
  }

  if (systemPrompt && !messages.some((m) => m.role === "system")) {
    messages.unshift({ role: "system", content: systemPrompt });
  }

  if (contentParts.length > 1) {
    messages.push({ role: "user", content: contentParts });
  } else {
    messages.push({ role: "user", content: contentParts[0]!.text ?? "" });
  }

  return messages;
}

// ── Request builder ──────────────────────────────────────────────────────────

export interface RequestOptions {
  model: string;
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: "low" | "medium" | "high";
  webSearch?: boolean;
  webSearchEngine?: string;
  webSearchMax?: number;
  webFetch?: boolean;
  datetime?: boolean;
  exacto?: boolean;
  serverCache?: boolean;
  serverCacheTtl?: number;
  heal?: boolean;
  pdfEngine?: string;
  modalities?: string[];
}

export function buildRequest(
  options: RequestOptions,
  messages: ChatMessage[]
): ChatRequest {
  const request: ChatRequest = {
    model: options.model,
    messages,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
  };

  // Reasoning
  if (options.reasoningEffort) {
    request.reasoning = { effort: options.reasoningEffort };
  }

  // Server tools
  const serverTools: any[] = [];
  if (options.webSearch) {
    const wsParams: any = {};
    if (options.webSearchEngine) wsParams.engine = options.webSearchEngine;
    if (options.webSearchMax) wsParams.max_results = options.webSearchMax;
    serverTools.push({
      type: "openrouter:web_search",
      ...(Object.keys(wsParams).length > 0 && { parameters: wsParams }),
    });
  }
  if (options.webFetch) {
    serverTools.push({ type: "openrouter:web_fetch" });
  }
  if (options.datetime) {
    serverTools.push({ type: "openrouter:datetime" });
  }
  if (serverTools.length > 0) {
    request.tools = serverTools;
  }

  // Plugins
  const plugins: any[] = [];
  if (options.pdfEngine) {
    plugins.push({ id: "file-parser", pdf: { engine: options.pdfEngine } });
  }
  if (options.heal) {
    plugins.push({ id: "response-healing" });
  }
  if (plugins.length > 0) {
    request.plugins = plugins;
  }

  // Modalities (for image/video generation)
  if (options.modalities) {
    request.modalities = options.modalities;
  }

  return request;
}

export function buildExtraHeaders(
  options: Pick<RequestOptions, "serverCache" | "serverCacheTtl">
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (options.serverCache) {
    headers["X-OpenRouter-Cache"] = "true";
    if (options.serverCacheTtl) {
      headers["X-OpenRouter-Cache-TTL"] = String(options.serverCacheTtl);
    }
  }
  return headers;
}

// ── Attachments descriptor ───────────────────────────────────────────────────

export function describeAttachments(inputs: MultimodalInputs): string[] {
  const attachments: string[] = [];
  if (inputs.images && inputs.images.length > 0)
    attachments.push(`images: ${inputs.images.join(", ")}`);
  if (inputs.audio) attachments.push(`audio: ${inputs.audio}`);
  if (inputs.video) attachments.push(`video: ${inputs.video}`);
  if (inputs.pdf) attachments.push(`pdf: ${inputs.pdf}`);
  return attachments;
}

// ── Streaming handler ────────────────────────────────────────────────────────

export interface StreamResult {
  fullText: string;
  reasoningText: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  provider?: string;
  finishReason?: string;
}

export async function handleStream(
  apiKey: string,
  request: ChatRequest,
  extraHeaders: Record<string, string>,
  options: { showReasoning?: boolean; onChunk?: (text: string) => void }
): Promise<StreamResult> {
  const stream = await chatCompletionStream(apiKey, { ...request, stream: true }, extraHeaders);
  const decoder = new TextDecoder();
  let fullText = "";
  let reasoningText = "";
  let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  let provider: string | undefined;
  let finishReason: string | undefined;

  for await (const chunk of stream) {
    const text = decoder.decode(chunk, { stream: true });
    for (const line of text.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;

        if (delta?.reasoning) {
          reasoningText += delta.reasoning;
          if (options.showReasoning) {
            process.stdout.write(chalk.dim(delta.reasoning));
          }
        }

        if (delta?.content) {
          fullText += delta.content;
          if (options.onChunk) {
            options.onChunk(delta.content);
          } else {
            process.stdout.write(delta.content);
          }
        }

        if (parsed.usage) usage = parsed.usage;
        if (parsed.provider) provider = parsed.provider;
        if (parsed.choices?.[0]?.finish_reason) finishReason = parsed.choices[0].finish_reason;
      } catch {
        // skip malformed chunks
      }
    }
  }

  return { fullText, reasoningText, usage, provider, finishReason };
}

// ── Non-streaming handler ────────────────────────────────────────────────────

export interface NonStreamResult {
  content: string;
  reasoning?: string;
  response: ChatResponse;
}

export async function handleNonStream(
  apiKey: string,
  request: ChatRequest,
  extraHeaders: Record<string, string>
): Promise<NonStreamResult> {
  const response = await chatCompletion(apiKey, request, extraHeaders);
  const respMessage = response.choices?.[0]?.message;
  const content = respMessage?.content ?? "";
  const reasoning = (respMessage as any)?.reasoning;

  return { content, reasoning, response };
}

// ── Image saving ─────────────────────────────────────────────────────────────

export interface SaveImageResult {
  saved: boolean;
  path?: string;
  sizeKb?: number;
  mimeType?: string;
}

export function saveImage(
  savePath: string,
  respMessage: any,
  quiet?: boolean
): SaveImageResult {
  const respImages = respMessage?.images ?? [];
  if (respImages.length === 0) {
    return { saved: false };
  }

  const img = respImages[0];
  const url = img?.image_url?.url ?? img?.url ?? "";

  if (url.startsWith("data:")) {
    const parts = url.split(",");
    const b64 = parts[1] ?? "";
    const mimeMatch = url.match(/^data:([^;]+);base64,/);
    const mime = mimeMatch ? mimeMatch[1] : "image/png";
    const isSvg = mime === "image/svg+xml";
    const imgBuf = Buffer.from(b64, "base64");
    let outPath = resolve(savePath);

    // Auto-detect SVG and fix extension
    if (isSvg && !outPath.endsWith(".svg")) {
      const newPath = outPath.replace(/\.(png|jpg|jpeg|webp|gif)$/i, ".svg");
      if (!quiet) {
        console.log(
          chalk.yellow(
            `⚠ Model returned SVG — saving as ${extname(newPath)} instead of ${extname(outPath)}`
          )
        );
      }
      outPath = newPath;
    }

    const dir = dirname(outPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(outPath, imgBuf);

    return {
      saved: true,
      path: outPath,
      sizeKb: imgBuf.length / 1024,
      mimeType: mime,
    };
  }

  if (url.startsWith("http")) {
    return { saved: false, mimeType: "url" };
  }

  return { saved: false };
}

// ── Cost estimation ──────────────────────────────────────────────────────────

export async function estimateCost(
  apiKey: string,
  modelId: string,
  promptTokens: number,
  completionTokens: number
): Promise<number | undefined> {
  try {
    const models = await fetchModels(apiKey);
    const model = models.find((m) => m.id === modelId);
    if (!model) return undefined;
    const input = parseFloat(model.pricing.prompt ?? "0") * promptTokens;
    const output = parseFloat(model.pricing.completion ?? "0") * completionTokens;
    return input + output;
  } catch {
    return undefined;
  }
}

// ── History logging ──────────────────────────────────────────────────────────

export interface HistoryOptions {
  apiKey: string;
  model: string;
  provider?: string;
  systemPrompt?: string;
  prompt: string;
  response: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs: number;
  temperature?: number;
  maxTokens?: number;
  finishReason?: string;
  quiet?: boolean;
}

export async function logHistory(options: HistoryOptions): Promise<void> {
  const costEstimate = await estimateCost(
    options.apiKey,
    options.model,
    options.usage.promptTokens,
    options.usage.completionTokens
  );

  appendHistory({
    id: generateId(),
    timestamp: new Date().toISOString(),
    model: options.model,
    provider: options.provider,
    systemPrompt: options.systemPrompt,
    prompt: options.prompt,
    response: options.response,
    finishReason: options.finishReason,
    usage: options.usage,
    costEstimate,
    latencyMs: options.latencyMs,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  });
}

// ── Stats printer ────────────────────────────────────────────────────────────

export interface StatsOptions {
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  latencyMs: number;
  model: string;
  provider?: string;
  reasoning?: string;
  attachments?: string[];
  conversationId?: string;
  cache?: { status?: string };
  annotations?: any[];
  cost?: number;
  quiet?: boolean;
  imageTokens?: number;
  reasoningTokens?: number;
  cachedTokens?: number;
}

export function printStats(options: StatsOptions): void {
  if (options.quiet) return;

  const tps = options.usage.completion_tokens / (options.latencyMs / 1000);
  const parts: string[] = [
    `${options.usage.total_tokens} tokens`,
    `(${options.usage.prompt_tokens} in / ${options.usage.completion_tokens} out)`,
    `• ${tps.toFixed(0)} tps`,
    `• ${(options.latencyMs / 1000).toFixed(1)}s`,
  ];

  if (options.cost != null) parts.push(`• $${options.cost.toFixed(4)}`);
  parts.push(`• ${options.model}`);
  if (options.provider) parts.push(`• ${options.provider}`);
  if (options.reasoning) parts.push(`• reasoning`);
  if (options.imageTokens) parts.push(`• ${options.imageTokens} img tokens`);
  if (options.reasoningTokens) parts.push(`• ${options.reasoningTokens} reasoning tokens`);
  if (options.cachedTokens) parts.push(`• ${options.cachedTokens} cached`);
  if (options.cache?.status === "HIT") parts.push(`• cache HIT`);
  if (options.cache?.status === "MISS") parts.push(`• cache MISS`);
  if (options.annotations?.length) parts.push(`• ${options.annotations.length} file annotation(s)`);
  if (options.attachments?.length) parts.push(`• ${options.attachments.join(", ")}`);
  if (options.conversationId) parts.push(`• conv:${options.conversationId}`);

  console.log(chalk.dim(`  ${parts.join(" ")}`));
}

// ── Stdin reader ─────────────────────────────────────────────────────────────

export function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data);
    });
    process.stdin.on("error", () => {
      resolve("");
    });
  });
}
