import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { requireOpenRouterKey, getDefaultModel } from "../lib/config";
import { getFormat, error } from "../lib/format";
import { formatNetworkError } from "../lib/fetch";
import type { ChatContentPart } from "../lib/types";
import {
  buildContentParts,
  buildMessages,
  buildRequest,
  buildExtraHeaders,
  describeAttachments,
  handleStream,
  handleNonStream,
  saveImage,
  logHistory,
  printStats,
} from "../lib/chat-core";
import {
  createConversation,
  appendConversation,
  loadConversation,
  getLastConversationId,
  toMessages,
} from "../lib/conversations";

export function chatCommand(): Command {
  const cmd = new Command("chat")
    .description("Send a message in a conversation (multi-turn chat)")
    .argument("[message...]", "Message to send")
    .option("-m, --model <model>", "Model to use")
    .option("-s, --system <prompt>", "System prompt")
    .option("--max-tokens <n>", "Max tokens in response", parseInt)
    .option("--temperature <n>", "Temperature (0-2)", parseFloat)
    .option("--reasoning-effort <level>", "Reasoning effort: low, medium, high")
    .option("--show-reasoning", "Show reasoning/thinking output")
    .option("--image <paths...>", "Send image file(s)")
    .option("--audio <path>", "Send an audio file")
    .option("--video <path>", "Send a video file")
    .option("--pdf <path>", "Send a PDF file (local or URL)")
    .option("--pdf-engine <engine>", "PDF engine: native, cloudflare-ai, mistral-ocr")
    .option("--web-search", "Enable web search")
    .option("--web-search-engine <engine>", "Search engine: auto, exa, firecrawl, parallel")
    .option("--web-search-max <n>", "Max results per search", parseInt)
    .option("--web-fetch", "Enable web fetch")
    .option("--datetime", "Enable datetime tool")
    .option("--exacto", "Use Exacto variant")
    .option("--server-cache", "Enable server-side caching")
    .option("--server-cache-ttl <seconds>", "Cache TTL (1-86400)", parseInt)
    .option("--heal", "Enable response healing")
    .option("--json", "Output full response as JSON")
    .option("--quiet", "Output only the response text")
    .option("--save <path>", "Save generated image to file")
    .option("--stream", "Stream the response (default for TTY)")
    .option("--no-stream", "Wait for full response")
    .option("--no-log", "Don't save to history")
    .option("--conversation", "Start or continue a conversation")
    .option("--continue", "Continue the most recent conversation")
    .option("--resume <id>", "Resume a specific conversation by ID")
    .action(async (messageParts: string[], opts: any) => {
      const apiKey = requireOpenRouterKey();
      const format = getFormat(opts);
      const isTty = process.stdout.isTTY;
      const message = messageParts.join(" ");

      // ── Build content parts ─────────────────────────────────────────
      const images = opts.image
        ? Array.isArray(opts.image)
          ? opts.image
          : [opts.image]
        : [];

      const inputs = {
        images: images.length > 0 ? images : undefined,
        audio: opts.audio,
        video: opts.video,
        pdf: opts.pdf,
      };

      let contentParts: ChatContentPart[];
      try {
        contentParts = buildContentParts(message, inputs);
      } catch (err) {
        error(String(err));
        process.exit(2);
      }

      // ── Determine modality and model ────────────────────────────────
      const modality =
        images.length > 0
          ? "vision"
          : opts.audio
            ? "audio"
            : opts.video
              ? "video"
              : opts.pdf
                ? "vision"
                : "text";

      let model = opts.model || getDefaultModel(modality) || "openai/gpt-4o-mini";
      if (opts.exacto && !model.includes(":exacto")) {
        model = `${model}:exacto`;
      }

      // ── Conversation context loading ────────────────────────────────
      let conversationId: string | null = null;
      const useConversation = opts.conversation || opts.continue || opts.resume;
      let historyMsgs: import("../lib/types").ChatMessage[] | undefined;

      if (opts.continue || opts.resume) {
        const loadId = opts.resume || getLastConversationId();
        if (!loadId) {
          error("No conversation to continue. Use --conversation to start a new one.");
          process.exit(2);
        }
        const entries = loadConversation(loadId);
        if (entries.length === 0) {
          error(`Conversation ${loadId} is empty or not found.`);
          process.exit(2);
        }
        conversationId = loadId;
        historyMsgs = toMessages(entries);

        if (!opts.quiet) {
          const msgCount = entries.filter((e) => e.role === "user").length;
          console.log(chalk.dim(`  Continuing conversation ${loadId} (${msgCount} prior messages)`));
        }
      }

      // ── Build messages and request ──────────────────────────────────
      const messages = buildMessages(contentParts, opts.system, historyMsgs);
      const request = buildRequest(
        {
          model,
          maxTokens: opts.maxTokens,
          temperature: opts.temperature,
          reasoningEffort: opts.reasoningEffort,
          webSearch: opts.webSearch,
          webSearchEngine: opts.webSearchEngine,
          webSearchMax: opts.webSearchMax,
          webFetch: opts.webFetch,
          datetime: opts.datetime,
          serverCache: opts.serverCache,
          serverCacheTtl: opts.serverCacheTtl,
          heal: opts.heal,
          pdfEngine: opts.pdfEngine,
        },
        messages
      );

      const extraHeaders = buildExtraHeaders({
        serverCache: opts.serverCache,
        serverCacheTtl: opts.serverCacheTtl,
      });

      const attachments = describeAttachments(inputs);
      if (opts.exacto) attachments.push("exacto");
      if (opts.serverCache) attachments.push("cached");
      if (opts.heal) attachments.push("healed");

      const useStream = opts.stream ?? (isTty && !opts.json && !opts.quiet);
      const startTime = Date.now();

      // ── Image gen detection ─────────────────────────────────────────
      let modelInfo: import("../lib/types").ORModel | undefined;
      if (opts.save || opts.audio || opts.video || images.length > 0) {
        try {
          const { fetchModels } = await import("../lib/openrouter");
          const allModels = await fetchModels(apiKey);
          modelInfo = allModels.find((m) => m.id === model);
        } catch {
          // Continue without model info
        }
      }

      if (opts.save && modelInfo) {
        const outputModalities = modelInfo.architecture?.output_modalities ?? [];
        if (outputModalities.includes("image")) {
          request.modalities = outputModalities.includes("text")
            ? ["image", "text"]
            : ["image"];
        }
      }

      try {
        if (useStream) {
          // Streaming mode
          const spinnerText =
            attachments.length > 0
              ? `Chatting with ${chalk.cyan(model)} (${attachments.join(", ")})...`
              : `Chatting with ${chalk.cyan(model)}...`;
          const spinner = opts.quiet ? null : ora({ text: spinnerText, spinner: "dots" }).start();

          const result = await handleStream(apiKey, request, extraHeaders, {
            showReasoning: opts.showReasoning,
            onChunk: (text) => {
              spinner?.stop();
              process.stdout.write(text);
            },
          });

          spinner?.stop();

          if (isTty && !result.fullText.endsWith("\n")) {
            process.stdout.write("\n");
          }

          const latencyMs = Date.now() - startTime;

          if (!opts.quiet) {
            printStats({
              usage: result.usage,
              latencyMs,
              model,
              provider: result.provider,
              reasoning: result.reasoningText,
              attachments: attachments.length > 0 ? attachments : undefined,
              conversationId: conversationId ?? undefined,
              quiet: opts.quiet,
            });
          }

          // History
          if (opts.log !== false && result.fullText) {
            await logHistory({
              apiKey,
              model,
              provider: result.provider,
              systemPrompt: opts.system,
              prompt: message + (attachments.length > 0 ? ` [${attachments.join(", ")}]` : ""),
              response: result.fullText,
              usage: {
                promptTokens: result.usage.prompt_tokens,
                completionTokens: result.usage.completion_tokens,
                totalTokens: result.usage.total_tokens,
              },
              latencyMs,
              temperature: opts.temperature,
              maxTokens: opts.maxTokens,
              finishReason: result.finishReason,
              quiet: opts.quiet,
            });
          }

          // Conversation
          if (useConversation && result.fullText) {
            const userContent = contentParts.length > 1 ? contentParts : message;
            if (conversationId) {
              appendConversation(conversationId, userContent, result.fullText, model, {
                usage: {
                  promptTokens: result.usage.prompt_tokens,
                  completionTokens: result.usage.completion_tokens,
                  totalTokens: result.usage.total_tokens,
                },
                latencyMs,
              });
            } else {
              conversationId = createConversation(opts.system, userContent, model, result.fullText, {
                usage: {
                  promptTokens: result.usage.prompt_tokens,
                  completionTokens: result.usage.completion_tokens,
                  totalTokens: result.usage.total_tokens,
                },
                latencyMs,
              });
              if (!opts.quiet) {
                console.log(chalk.dim(`  Conversation: ${conversationId}`));
              }
            }
          }
        } else {
          // Non-streaming mode
          const spinnerText =
            attachments.length > 0
              ? `Chatting with ${chalk.cyan(model)} (${attachments.join(", ")})...`
              : `Chatting with ${chalk.cyan(model)}...`;
          const spinner = opts.quiet ? null : ora({ text: spinnerText, spinner: "dots" }).start();

          const result = await handleNonStream(apiKey, request, extraHeaders);
          const latencyMs = Date.now() - startTime;
          spinner?.stop();

          const respMessage = result.response.choices?.[0]?.message;
          const content = respMessage?.content ?? "";
          const reasoning = result.reasoning;
          const cache = (result.response as any).cache;
          const annotations = respMessage?.annotations;
          const tokenDetails = (result.response as any).usage?.completion_tokens_details;
          const promptDetails = (result.response as any).usage?.prompt_tokens_details;
          const cost = (result.response as any).usage?.cost;

          // Save image if --save
          if (opts.save) {
            const saveResult = saveImage(opts.save, respMessage, opts.quiet);
            if (saveResult.saved) {
              if (!opts.quiet) {
                console.log(
                  chalk.green(`✓ Saved to ${saveResult.path} (${saveResult.sizeKb!.toFixed(0)}KB)`)
                );
              }
            } else if (saveResult.mimeType === "url") {
              if (!opts.quiet) {
                console.log(chalk.yellow("Image returned as URL — use --json to get the full response"));
              }
            }
          }

          // History
          if (opts.log !== false && content) {
            await logHistory({
              apiKey,
              model,
              provider: result.response.provider,
              systemPrompt: opts.system,
              prompt: message + (attachments.length > 0 ? ` [${attachments.join(", ")}]` : ""),
              response: content,
              usage: {
                promptTokens: result.response.usage.prompt_tokens,
                completionTokens: result.response.usage.completion_tokens,
                totalTokens: result.response.usage.total_tokens,
              },
              latencyMs,
              temperature: opts.temperature,
              maxTokens: opts.maxTokens,
              finishReason: result.response.choices?.[0]?.finish_reason,
              quiet: opts.quiet,
            });
          }

          // Conversation
          if (useConversation && content) {
            const userContent = contentParts.length > 1 ? contentParts : message;
            if (conversationId) {
              appendConversation(conversationId, userContent, content, model, {
                usage: {
                  promptTokens: result.response.usage.prompt_tokens,
                  completionTokens: result.response.usage.completion_tokens,
                  totalTokens: result.response.usage.total_tokens,
                },
                latencyMs,
              });
            } else {
              conversationId = createConversation(opts.system, userContent, model, content, {
                usage: {
                  promptTokens: result.response.usage.prompt_tokens,
                  completionTokens: result.response.usage.completion_tokens,
                  totalTokens: result.response.usage.total_tokens,
                },
                latencyMs,
              });
              if (!opts.quiet) {
                console.log(chalk.dim(`  Conversation: ${conversationId}`));
              }
            }
          }

          // Output
          if (format === "json") {
            console.log(JSON.stringify(result.response, null, 2));
          } else if (opts.quiet) {
            process.stdout.write(content);
            if (isTty) process.stdout.write("\n");
          } else {
            if (reasoning && (opts.showReasoning || opts.reasoningEffort)) {
              console.log(chalk.dim("── Reasoning ──"));
              console.log(chalk.dim(reasoning));
              console.log("");
              console.log(chalk.bold("── Response ──"));
            }
            console.log(content);
            console.log("");

            printStats({
              usage: result.response.usage,
              latencyMs,
              model,
              provider: result.response.provider,
              reasoning,
              attachments: attachments.length > 0 ? attachments : undefined,
              cache,
              annotations,
              cost,
              imageTokens: tokenDetails?.image_tokens,
              reasoningTokens: tokenDetails?.reasoning_tokens,
              cachedTokens: promptDetails?.cached_tokens,
              conversationId: conversationId ?? undefined,
              quiet: opts.quiet,
            });
          }
        }
      } catch (err) {
        error(formatNetworkError(err));
        process.exit(1);
      }
    });

  return cmd;
}
