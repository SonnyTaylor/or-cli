import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve, extname, dirname } from "path";
import { requireOpenRouterKey, getConfig, getDefaultModel } from "../lib/config";
import { chatCompletion, chatCompletionStream, fetchModels, combinedPrice } from "../lib/openrouter";
import { formatNetworkError } from "../lib/fetch";
import { getFormat, error } from "../lib/format";
import { appendHistory, generateId } from "../lib/history";
import {
  createConversation,
  appendConversation,
  loadConversation,
  getLastConversationId,
  toMessages,
} from "../lib/conversations";
import type { ChatMessage, ChatContentPart } from "../lib/types";

// MIME type mappings
const IMAGE_EXTS: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
};

const AUDIO_EXTS: Record<string, string> = {
  ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
  ".flac": "audio/flac", ".ogg": "audio/ogg", ".webm": "audio/webm",
};

const VIDEO_EXTS: Record<string, string> = {
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".avi": "video/x-msvideo", ".mkv": "video/x-matroska",
};

const PDF_EXTS: Record<string, string> = {
  ".pdf": "application/pdf",
};

function fileToBase64(filePath: string): string {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    error(`File not found: ${filePath}`);
    process.exit(1);
  }
  const buffer = readFileSync(absPath);
  return buffer.toString("base64");
}

function getMimeType(filePath: string, extMap: Record<string, string>, fallback: string): string {
  const ext = extname(filePath).toLowerCase();
  return extMap[ext] ?? fallback;
}

export function chatCommand(): Command {
  const cmd = new Command("chat")
    .description("Send a message to a model and get a response")
    .argument("<message...>", "Message to send")
    .option("-m, --model <model>", "Model to use (e.g. deepseek/deepseek-v4-flash)")
    .option("-s, --system <prompt>", "System prompt")
    .option("--max-tokens <n>", "Max tokens in response", parseInt)
    .option("--temperature <n>", "Temperature (0-2)", parseFloat)
    .option("--reasoning-effort <level>", "Reasoning effort: low, medium, high (189 models support reasoning)")
    .option("--show-reasoning", "Show reasoning/thinking output (not all models return this)")
    .option("--image <paths...>", "Send image file(s) (jpg, png, gif, webp) — can be repeated")
    .option("--audio <path>", "Send an audio file (wav, mp3, m4a, flac)")
    .option("--video <path>", "Send a video file (mp4, webm, mov) — requires Gemini or similar")
    .option("--pdf <path>", "Send a PDF file (local file or URL)")
    .option("--pdf-engine <engine>", "PDF processing engine: native, cloudflare-ai, mistral-ocr")
    .option("--web-search", "Enable web search server tool (model can search the web)")
    .option("--web-search-engine <engine>", "Search engine: auto, exa, firecrawl, parallel")
    .option("--web-search-max <n>", "Max results per web search", parseInt)
    .option("--web-fetch", "Enable web fetch server tool (model can fetch URLs)")
    .option("--datetime", "Enable datetime server tool (model gets current date/time)")
    .option("--exacto", "Use Exacto variant for quality-first provider routing")
    .option("--server-cache", "Enable OpenRouter response caching (free cache hits)")
    .option("--server-cache-ttl <seconds>", "Cache TTL in seconds (1-86400)", parseInt)
    .option("--heal", "Enable response healing plugin (auto-fix malformed JSON)")
    .option("--json", "Output full response as JSON")
    .option("--quiet", "Output only the response text (for piping)")
    .option("--save <path>", "Save generated image to file (for image models)")
    .option("--stream", "Stream the response (default for TTY)")
    .option("--no-stream", "Wait for full response")
    .option("--no-log", "Don't save to history")
    .option("--conversation", "Start or continue a conversation (persists context)")
    .option("--continue", "Continue the most recent conversation")
    .option("--resume <id>", "Resume a specific conversation by ID")
    .action(async (messageParts: string[], opts) => {
      const apiKey = requireOpenRouterKey();
      const message = messageParts.join(" ");
      const format = getFormat(opts);
      const isTTY = process.stdout.isTTY;

      // Build message content (handles multimodal)
      const contentParts: ChatContentPart[] = [];

      // Add images if provided (supports multiple --image flags)
      const images = opts.image ? (Array.isArray(opts.image) ? opts.image : [opts.image]) : [];
      for (const imgPath of images) {
        const base64 = fileToBase64(imgPath);
        const mime = getMimeType(imgPath, IMAGE_EXTS, "image/jpeg");
        contentParts.push({
          type: "image_url",
          image_url: { url: `data:${mime};base64,${base64}` },
        });
      }

      // Add audio if provided
      if (opts.audio) {
        const base64 = fileToBase64(opts.audio);
        const ext = extname(opts.audio).toLowerCase().slice(1);
        contentParts.push({
          type: "input_audio",
          input_audio: { data: base64, format: ext || "wav" },
        });
      }

      // Add video if provided (base64 data URL)
      if (opts.video) {
        const base64 = fileToBase64(opts.video);
        const mime = getMimeType(opts.video, VIDEO_EXTS, "video/mp4");
        contentParts.push({
          type: "video_url",
          video_url: { url: `data:${mime};base64,${base64}` },
        });
      }

      // Add PDF if provided
      if (opts.pdf) {
        const pdfPath = resolve(opts.pdf);
        if (pdfPath.startsWith("http://") || pdfPath.startsWith("https://")) {
          // URL-based PDF
          contentParts.push({
            type: "file",
            file: { filename: pdfPath.split("/").pop() || "document.pdf", file_data: pdfPath },
          });
        } else {
          // Local file - base64 encode
          if (!existsSync(pdfPath)) {
            error(`PDF not found: ${opts.pdf}`);
            process.exit(1);
          }
          const base64 = readFileSync(pdfPath).toString("base64");
          contentParts.push({
            type: "file",
            file: {
              filename: pdfPath.split(/[\\/]/).pop() || "document.pdf",
              file_data: `data:application/pdf;base64,${base64}`,
            },
          });
        }
      }

      // Add text content
      contentParts.push({ type: "text", text: message });

      // Build messages array
      const messages: ChatMessage[] = [];

      // Determine modality for default model selection
      const modality = images.length > 0 ? "vision" : opts.audio ? "audio" : opts.video ? "video" : opts.pdf ? "vision" : "text";
      let model = opts.model || getDefaultModel(modality) || "openai/gpt-4o-mini";
      
      // Apply :exacto suffix for quality-first provider routing
      if (opts.exacto && !model.includes(":exacto")) {
        model = `${model}:exacto`;
      }
      
      const useStream = opts.stream ?? (isTTY && !opts.json && !opts.quiet);
      const startTime = Date.now();

      // ── Conversation context loading ──────────────────────────────────
      let conversationId: string | null = null;
      const useConversation = opts.conversation || opts.continue || opts.resume;

      if (opts.continue || opts.resume) {
        // Load existing conversation
        const loadId = opts.resume || getLastConversationId();
        if (!loadId) {
          error("No conversation to continue. Use --conversation to start a new one.");
          process.exit(1);
        }
        const entries = loadConversation(loadId);
        if (entries.length === 0) {
          error(`Conversation ${loadId} is empty or not found.`);
          process.exit(1);
        }
        conversationId = loadId;

        // Prepend conversation history as ChatMessages
        const historyMsgs = toMessages(entries);
        messages.push(...historyMsgs);

        if (!opts.quiet) {
          const msgCount = entries.filter((e) => e.role === "user").length;
          console.log(chalk.dim(`  Continuing conversation ${loadId} (${msgCount} prior messages)`));
        }
      } else if (opts.conversation) {
        // Start fresh — conversation will be created after response
        conversationId = null;
      }

      // Add system prompt if provided (and not already in conversation history)
      if (opts.system && !messages.some((m) => m.role === "system")) {
        messages.unshift({ role: "system", content: opts.system });
      }

      // Add user message
      if (contentParts.length > 1) {
        messages.push({ role: "user", content: contentParts });
      } else {
        messages.push({ role: "user", content: message });
      }

      // Build request with optional reasoning
      const request: any = {
        model,
        messages,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
      };

      if (opts.reasoningEffort) {
        const effort = opts.reasoningEffort.toLowerCase();
        if (!["low", "medium", "high"].includes(effort)) {
          error("Reasoning effort must be: low, medium, or high");
          process.exit(1);
        }
        request.reasoning = { effort };
      }

      // ── Server Tools ────────────────────────────────────────────────────
      const serverTools: any[] = [];

      if (opts.webSearch) {
        const wsParams: any = {};
        if (opts.webSearchEngine) wsParams.engine = opts.webSearchEngine;
        if (opts.webSearchMax) wsParams.max_results = opts.webSearchMax;
        serverTools.push({
          type: "openrouter:web_search",
          ...(Object.keys(wsParams).length > 0 && { parameters: wsParams }),
        });
      }

      if (opts.webFetch) {
        serverTools.push({ type: "openrouter:web_fetch" });
      }

      if (opts.datetime) {
        serverTools.push({ type: "openrouter:datetime" });
      }

      if (serverTools.length > 0) {
        request.tools = serverTools;
      }

      // ── Plugins ─────────────────────────────────────────────────────────
      const plugins: any[] = [];

      if (opts.pdfEngine) {
        plugins.push({
          id: "file-parser",
          pdf: { engine: opts.pdfEngine },
        });
      }

      if (opts.heal) {
        plugins.push({ id: "response-healing" });
      }

      if (plugins.length > 0) {
        request.plugins = plugins;
      }

      // ── Custom headers for server-side caching ──────────────────────────
      const extraHeaders: Record<string, string> = {};
      if (opts.serverCache) {
        extraHeaders["X-OpenRouter-Cache"] = "true";
        if (opts.serverCacheTtl) {
          extraHeaders["X-OpenRouter-Cache-TTL"] = String(opts.serverCacheTtl);
        }
      }

      // Log what we're sending
      const attachments: string[] = [];
      if (images.length > 0) attachments.push(`images: ${images.join(", ")}`);
      if (opts.audio) attachments.push(`audio: ${opts.audio}`);
      if (opts.video) attachments.push(`video: ${opts.video}`);
      if (opts.pdf) attachments.push(`pdf: ${opts.pdf}`);
      if (opts.webSearch) attachments.push("web-search");
      if (opts.webFetch) attachments.push("web-fetch");
      if (opts.datetime) attachments.push("datetime");
      if (opts.exacto) attachments.push("exacto");
      if (opts.serverCache) attachments.push("cached");
      if (opts.heal) attachments.push("healed");

      try {
        if (useStream) {
          // Streaming mode
          const spinnerText = attachments.length > 0
            ? `Querying ${chalk.cyan(model)} with ${attachments.join(", ")}...`
            : `Querying ${chalk.cyan(model)}...`;
          const spinner = ora({ text: spinnerText, spinner: "dots" }).start();

          const stream = await chatCompletionStream(apiKey, { ...request, stream: true }, extraHeaders);

          spinner.stop();
          const decoder = new TextDecoder();
          let fullText = "";
          let reasoningText = "";
          let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
          let provider: string | undefined;

          for await (const chunk of stream) {
            const text = decoder.decode(chunk, { stream: true });
            for (const line of text.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;

                // Handle reasoning output
                if (delta?.reasoning) {
                  reasoningText += delta.reasoning;
                  if (opts.showReasoning) {
                    process.stdout.write(chalk.dim(delta.reasoning));
                  }
                }

                // Handle content output
                if (delta?.content) {
                  fullText += delta.content;
                  process.stdout.write(delta.content);
                }

                if (parsed.usage) usage = parsed.usage;
                if (parsed.provider) provider = parsed.provider;
              } catch {
                // skip malformed chunks
              }
            }
          }

          if (isTTY && !fullText.endsWith("\n")) {
            process.stdout.write("\n");
          }

          // Print stats for streaming mode
          if (!opts.quiet) {
            const latencyMs = Date.now() - startTime;
            const tps = usage.completion_tokens / (latencyMs / 1000);
            const stats: string[] = [
              `${usage.total_tokens} tokens`,
              `(${usage.prompt_tokens} in / ${usage.completion_tokens} out)`,
              `• ${tps.toFixed(0)} tps`,
              `• ${(latencyMs / 1000).toFixed(1)}s`,
              `• ${model}`,
            ];
            if (provider) stats.push(`• ${provider}`);
            if (reasoningText) stats.push(`• reasoning`);
            if (attachments.length > 0) stats.push(`• ${attachments.join(", ")}`);
            if (conversationId) stats.push(`• conv:${conversationId}`);
            console.log(chalk.dim(`  ${stats.join(" ")}`));
          }

          // Log to history
          if (opts.log !== false && fullText) {
            const latencyMs = Date.now() - startTime;
            const costEstimate = await estimateCost(apiKey, model, usage.prompt_tokens, usage.completion_tokens);
            appendHistory({
              id: generateId(),
              timestamp: new Date().toISOString(),
              model,
              provider,
              systemPrompt: opts.system,
              prompt: message + (attachments.length > 0 ? ` [${attachments.join(", ")}]` : ""),
              response: fullText,
              usage: {
                promptTokens: usage.prompt_tokens,
                completionTokens: usage.completion_tokens,
                totalTokens: usage.total_tokens,
              },
              costEstimate,
              latencyMs,
              temperature: opts.temperature,
              maxTokens: opts.maxTokens,
            });
          }

          // Save to conversation
          if (useConversation && fullText) {
            const latencyMs = Date.now() - startTime;
            const costEstimate = await estimateCost(apiKey, model, usage.prompt_tokens, usage.completion_tokens);
            if (conversationId) {
              // Append to existing conversation
              const userContent = contentParts.length > 1 ? contentParts : message;
              appendConversation(conversationId, userContent, fullText, model, {
                usage: { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, totalTokens: usage.total_tokens },
                costEstimate,
                latencyMs,
              });
            } else {
              // Create new conversation
              conversationId = createConversation(opts.system, contentParts.length > 1 ? contentParts : message, model, fullText, {
                usage: { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, totalTokens: usage.total_tokens },
                costEstimate,
                latencyMs,
              });
              if (!opts.quiet) {
                console.log(chalk.dim(`  Conversation: ${conversationId}`));
              }
            }
          }

        } else {
          // Non-streaming mode
          const spinnerText = attachments.length > 0
            ? `Querying ${chalk.cyan(model)} with ${attachments.join(", ")}...`
            : `Querying ${chalk.cyan(model)}...`;
          const spinner = ora({ text: spinnerText, spinner: "dots" }).start();

          const response = await chatCompletion(apiKey, request, extraHeaders);

          const latencyMs = Date.now() - startTime;
          spinner.stop();

          const respMessage = response.choices?.[0]?.message;
          const content = respMessage?.content ?? "";
          const reasoning = (respMessage as any)?.reasoning;
          const cacheStatus = (response as any)?.usage?.cache_status;
          const annotations = respMessage?.annotations;

          // Log to history
          if (opts.log !== false && content) {
            const costEstimate = await estimateCost(
              apiKey,
              model,
              response.usage.prompt_tokens,
              response.usage.completion_tokens
            );
            appendHistory({
              id: generateId(),
              timestamp: new Date().toISOString(),
              model,
              provider: response.provider,
              systemPrompt: opts.system,
              prompt: message + (attachments.length > 0 ? ` [${attachments.join(", ")}]` : ""),
              response: content,
              finishReason: response.choices?.[0]?.finish_reason,
              usage: {
                promptTokens: response.usage.prompt_tokens,
                completionTokens: response.usage.completion_tokens,
                totalTokens: response.usage.total_tokens,
              },
              costEstimate,
              latencyMs,
              temperature: opts.temperature,
              maxTokens: opts.maxTokens,
            });
          }

          // Save to conversation
          if (useConversation && content) {
            const costEstimate = await estimateCost(apiKey, model, response.usage.prompt_tokens, response.usage.completion_tokens);
            if (conversationId) {
              // Append to existing conversation
              const userContent = contentParts.length > 1 ? contentParts : message;
              appendConversation(conversationId, userContent, content, model, {
                usage: { promptTokens: response.usage.prompt_tokens, completionTokens: response.usage.completion_tokens, totalTokens: response.usage.total_tokens },
                costEstimate,
                latencyMs,
              });
            } else {
              // Create new conversation
              conversationId = createConversation(opts.system, contentParts.length > 1 ? contentParts : message, model, content, {
                usage: { promptTokens: response.usage.prompt_tokens, completionTokens: response.usage.completion_tokens, totalTokens: response.usage.total_tokens },
                costEstimate,
                latencyMs,
              });
              if (!opts.quiet) {
                console.log(chalk.dim(`  Conversation: ${conversationId}`));
              }
            }
          }

          // Save image if --save flag and images exist
          if (opts.save) {
            const images = (respMessage as any)?.images ?? [];
            if (images.length > 0) {
              const img = images[0];
              const url = img?.image_url?.url ?? img?.url ?? "";
              if (url.startsWith("data:")) {
                const parts = url.split(",");
                const b64 = parts[1] ?? "";
                const imgBuf = Buffer.from(b64, "base64");
                let savePath = resolve(opts.save);
                
                // Auto-detect SVG content and fix extension
                const contentStr = imgBuf.toString("utf-8");
                const isSvg = contentStr.trimStart().startsWith("<svg") || contentStr.trimStart().startsWith("<?xml");
                if (isSvg && !savePath.endsWith(".svg")) {
                  const newPath = savePath.replace(/\.(png|jpg|jpeg|webp|gif)$/i, ".svg");
                  if (!opts.quiet) {
                    console.log(chalk.yellow(`⚠ Model returned SVG — saving as ${extname(newPath)} instead of ${extname(savePath)}`));
                  }
                  savePath = newPath;
                }
                
                const dir = dirname(savePath);
                if (!existsSync(dir)) {
                  mkdirSync(dir, { recursive: true });
                }
                writeFileSync(savePath, imgBuf);
                if (!opts.quiet) {
                  console.log(chalk.green(`✓ Saved to ${savePath} (${(imgBuf.length / 1024).toFixed(0)}KB)`));
                }
              } else if (url.startsWith("http")) {
                if (!opts.quiet) {
                  console.log(chalk.yellow(`Image URL: ${url}`));
                  console.log(chalk.dim("Use --json to get the full response with image data"));
                }
              }
            } else if (!opts.quiet) {
              console.log(chalk.yellow("No images in response"));
            }
          }

          if (format === "json") {
            console.log(JSON.stringify(response, null, 2));
          } else if (opts.quiet) {
            process.stdout.write(content);
            if (isTTY) process.stdout.write("\n");
          } else {
            // Show reasoning if available and requested
            if (reasoning && (opts.showReasoning || opts.reasoningEffort)) {
              console.log(chalk.dim("── Reasoning ──"));
              console.log(chalk.dim(reasoning));
              console.log("");
              console.log(chalk.bold("── Response ──"));
            }
            console.log(content);
            console.log("");

            // Stats line — detailed metrics for agents
            const tps = response.usage.completion_tokens / (latencyMs / 1000);
            const cost = (response as any).usage?.cost;
            const costDetails = (response as any).usage?.cost_details;
            const tokenDetails = (response as any).usage?.completion_tokens_details;
            const promptDetails = (response as any).usage?.prompt_tokens_details;

            const stats: string[] = [
              `${response.usage.total_tokens} tokens`,
              `(${response.usage.prompt_tokens} in / ${response.usage.completion_tokens} out)`,
              `• ${tps.toFixed(0)} tps`,
              `• ${(latencyMs / 1000).toFixed(1)}s`,
            ];
            if (cost != null) stats.push(`• $${cost.toFixed(4)}`);
            stats.push(`• ${response.model}`);
            if (response.provider) stats.push(`• ${response.provider}`);
            if (reasoning) stats.push(`• reasoning`);
            if (tokenDetails?.image_tokens) stats.push(`• ${tokenDetails.image_tokens} img tokens`);
            if (tokenDetails?.reasoning_tokens) stats.push(`• ${tokenDetails.reasoning_tokens} reasoning tokens`);
            if (promptDetails?.cached_tokens) stats.push(`• ${promptDetails.cached_tokens} cached`);
            if (opts.serverCache) {
              // Check response headers for cache status via usage
              const cacheInfo = (response as any)?.cache;
              if (cacheInfo?.status === 'HIT') {
                stats.push(`• cache HIT`);
              } else if (cacheInfo?.status === 'MISS') {
                stats.push(`• cache MISS`);
              }
            }
            if (annotations && annotations.length > 0) {
              stats.push(`• ${annotations.length} file annotation(s)`);
            }
            if (attachments.length > 0) stats.push(`• ${attachments.join(", ")}`);
            if (conversationId) stats.push(`• conv:${conversationId}`);
            console.log(chalk.dim(`  ${stats.join(" ")}`));
          }
        }
      } catch (err) {
        error(formatNetworkError(err));
        process.exit(1);
      }
    });

  return cmd;
}

async function estimateCost(
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
