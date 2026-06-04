import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { requireOpenRouterKey, getConfig } from "../lib/config";
import { chatCompletion, chatCompletionStream, fetchModels, combinedPrice } from "../lib/openrouter";
import { getFormat, error } from "../lib/format";
import { appendHistory, generateId } from "../lib/history";
import type { ChatMessage } from "../lib/types";

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
    .option("--json", "Output full response as JSON")
    .option("--quiet", "Output only the response text (for piping)")
    .option("--stream", "Stream the response (default for TTY)")
    .option("--no-stream", "Wait for full response")
    .option("--no-log", "Don't save to history")
    .action(async (messageParts: string[], opts) => {
      const apiKey = requireOpenRouterKey();
      const message = messageParts.join(" ");
      const format = getFormat(opts);
      const isTTY = process.stdout.isTTY;

      const messages: ChatMessage[] = [];
      if (opts.system) {
        messages.push({ role: "system", content: opts.system });
      }
      messages.push({ role: "user", content: message });

      const model = opts.model || getConfig().defaultModel || "openai/gpt-4o-mini";
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

      try {
        if (useStream) {
          // Streaming mode
          const spinner = ora({ text: `Querying ${chalk.cyan(model)}...`, spinner: "dots" }).start();

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
                  // If showing reasoning, add separator before content
                  if (opts.showReasoning && reasoningText && !fullText.slice(0, -delta.content.length)) {
                    process.stdout.write("\n" + chalk.bold("── Response ──") + "\n");
                  }
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
              prompt: message,
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
          const spinner = ora({ text: `Querying ${chalk.cyan(model)}...`, spinner: "dots" }).start();

          const response = await chatCompletion(apiKey, request);

          const latencyMs = Date.now() - startTime;
          spinner.stop();

          const message = response.choices?.[0]?.message;
          const content = message?.content ?? "";
          const reasoning = (message as any)?.reasoning;

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
              prompt: messageParts.join(" "),
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

            // Stats line
            const stats: string[] = [
              `${response.usage.total_tokens} tokens`,
              `(${response.usage.prompt_tokens} in / ${response.usage.completion_tokens} out)`,
              `• ${latencyMs}ms`,
              `• ${response.model}`,
            ];
            if (response.provider) stats.push(`• ${response.provider}`);
            if (reasoning) stats.push(`• reasoning included`);
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
