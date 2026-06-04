import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve, extname, dirname } from "path";
import { requireOpenRouterKey, getConfig, getDefaultModel } from "../lib/config";
import { chatCompletion, chatCompletionStream, fetchModels, combinedPrice } from "../lib/openrouter";
import { getFormat, error } from "../lib/format";
import { appendHistory, generateId } from "../lib/history";
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
    .option("--image <path>", "Send an image file (jpg, png, gif, webp)")
    .option("--audio <path>", "Send an audio file (wav, mp3, m4a, flac)")
    .option("--video <path>", "Send a video file (mp4, webm, mov) — requires Gemini or similar")
    .option("--json", "Output full response as JSON")
    .option("--quiet", "Output only the response text (for piping)")
    .option("--save <path>", "Save generated image to file (for image models)")
    .option("--stream", "Stream the response (default for TTY)")
    .option("--no-stream", "Wait for full response")
    .option("--no-log", "Don't save to history")
    .action(async (messageParts: string[], opts) => {
      const apiKey = requireOpenRouterKey();
      const message = messageParts.join(" ");
      const format = getFormat(opts);
      const isTTY = process.stdout.isTTY;

      // Build message content (handles multimodal)
      const contentParts: ChatContentPart[] = [];

      // Add image if provided
      if (opts.image) {
        const base64 = fileToBase64(opts.image);
        const mime = getMimeType(opts.image, IMAGE_EXTS, "image/jpeg");
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

      // Add text content
      contentParts.push({ type: "text", text: message });

      // Build messages array
      const messages: ChatMessage[] = [];
      if (opts.system) {
        messages.push({ role: "system", content: opts.system });
      }

      // Use content parts if we have multimodal, otherwise plain text
      if (contentParts.length > 1) {
        messages.push({ role: "user", content: contentParts });
      } else {
        messages.push({ role: "user", content: message });
      }

      // Determine modality for default model selection
      const modality = opts.image ? "vision" : opts.audio ? "audio" : opts.video ? "video" : "text";
      const model = opts.model || getDefaultModel(modality) || "openai/gpt-4o-mini";
      const useStream = opts.stream ?? (isTTY && !opts.json && !opts.quiet);
      const startTime = Date.now();

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

      // Log what we're sending
      const attachments: string[] = [];
      if (opts.image) attachments.push(`image: ${opts.image}`);
      if (opts.audio) attachments.push(`audio: ${opts.audio}`);
      if (opts.video) attachments.push(`video: ${opts.video}`);

      try {
        if (useStream) {
          // Streaming mode
          const spinnerText = attachments.length > 0
            ? `Querying ${chalk.cyan(model)} with ${attachments.join(", ")}...`
            : `Querying ${chalk.cyan(model)}...`;
          const spinner = ora({ text: spinnerText, spinner: "dots" }).start();

          const stream = await chatCompletionStream(apiKey, { ...request, stream: true });

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

        } else {
          // Non-streaming mode
          const spinnerText = attachments.length > 0
            ? `Querying ${chalk.cyan(model)} with ${attachments.join(", ")}...`
            : `Querying ${chalk.cyan(model)}...`;
          const spinner = ora({ text: spinnerText, spinner: "dots" }).start();

          const response = await chatCompletion(apiKey, request);

          const latencyMs = Date.now() - startTime;
          spinner.stop();

          const respMessage = response.choices?.[0]?.message;
          const content = respMessage?.content ?? "";
          const reasoning = (respMessage as any)?.reasoning;

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
            if (attachments.length > 0) stats.push(`• ${attachments.join(", ")}`);
            console.log(chalk.dim(`  ${stats.join(" ")}`));
          }
        }
      } catch (err) {
        error(String(err));
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
