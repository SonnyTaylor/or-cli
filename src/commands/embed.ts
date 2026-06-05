import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { requireOpenRouterKey } from "../lib/config";
import { getFormat, error, formatDollars } from "../lib/format";
import { apiFetch, formatNetworkError } from "../lib/fetch";
import { readStdin, fileToBase64, getMimeType, IMAGE_EXTS, AUDIO_EXTS, VIDEO_EXTS } from "../lib/chat-core";
import type { GlobalOptions, EmbeddingsRequest, EmbeddingsResponse } from "../lib/types";

const EMBEDDINGS_API = "https://openrouter.ai/api/v1/embeddings";
const EMBEDDINGS_MODELS_API = "https://openrouter.ai/api/v1/embeddings/models";

interface EmbeddingModel {
  id: string;
  name: string;
  description?: string;
  pricing?: { prompt?: string; request?: string };
  context_length?: number;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
}

async function fetchEmbeddingModels(apiKey: string): Promise<EmbeddingModel[]> {
  const res = await apiFetch(EMBEDDINGS_MODELS_API, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch embedding models: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { data: EmbeddingModel[] };
  return data.data;
}

function formatModelPrice(model: EmbeddingModel): string {
  const prompt = parseFloat(model.pricing?.prompt ?? "0");
  const request = parseFloat(model.pricing?.request ?? "0");
  if (prompt > 0) return `$${(prompt * 1_000_000).toFixed(2)}/1M tokens`;
  if (request > 0) return `$${request.toFixed(4)}/request`;
  return "free";
}

export function embedCommand(): Command {
  const cmd = new Command("embed")
    .description("Generate embeddings for text, images, audio, or video")
    .argument("[input...]", "Text to embed (or pass via --input)")
    .option("-m, --model <model>", "Embedding model", "openai/text-embedding-3-small")
    .option("--input <text>", "Text to embed (alternative to positional arg)")
    .option("--input-file <path>", "Read input text from file")
    .option("--dimensions <n>", "Number of dimensions for the output embedding", parseInt)
    .option("--format-out <format>", "Output format: float or base64", "float")
    .option("--input-type <type>", "Input type: search_query, search_document")
    .option("--image <path>", "Image input for multimodal embedding")
    .option("--audio <path>", "Audio input for multimodal embedding")
    .option("--video <path>", "Video input for multimodal embedding")
    .option("--batch <paths...>", "Batch embed multiple files (text files)")
    .option("--list-models", "List available embedding models")
    .option("--json", "Output as JSON")
    .option("--quiet", "Output only the embedding vectors")
    .action(async (inputParts: string[], opts: any) => {
      const apiKey = requireOpenRouterKey();
      const format = getFormat(opts);

      // ── List models ─────────────────────────────────────────────────
      if (opts.listModels) {
        const spinner = opts.quiet ? null : ora("Fetching embedding models...").start();
        try {
          const models = await fetchEmbeddingModels(apiKey);
          spinner?.stop();

          if (format === "json") {
            console.log(JSON.stringify(models, null, 2));
            return;
          }

          if (opts.quiet) return;

          console.log(chalk.bold("\n  Available Embedding Models\n"));
          for (const m of models) {
            console.log(`  ${chalk.cyan(m.id)}  ${chalk.dim(formatModelPrice(m))}`);
            if (m.name) console.log(`    ${m.name}`);
            if (m.description) {
              const desc = m.description.length > 120 ? m.description.slice(0, 117) + "..." : m.description;
              console.log(`    ${chalk.dim(desc)}`);
            }
            if (m.context_length) console.log(`    ${chalk.dim(`Context: ${m.context_length} tokens`)}`);
            console.log("");
          }
          console.log(chalk.dim(`  ${models.length} model(s)`));
          console.log("");
          return;
        } catch (err) {
          spinner?.fail("Failed to fetch models");
          error(formatNetworkError(err));
          process.exit(1);
        }
      }

      // ── Collect input ───────────────────────────────────────────────
      let input: string | string[] | any[];

      // Multimodal mode (image/audio/video)
      if (opts.image || opts.audio || opts.video) {
        const contentParts: any[] = [];

        // Text part
        let text = opts.input ?? inputParts.join(" ");
        if (!text && !process.stdin.isTTY) text = await readStdin();
        if (text && text.trim()) {
          contentParts.push({ type: "text", text: text.trim() });
        }

        if (opts.image) {
          const absPath = resolve(opts.image);
          if (!existsSync(absPath)) { error(`Image not found: ${opts.image}`); process.exit(2); }
          const b64 = readFileSync(absPath).toString("base64");
          const mime = getMimeType(absPath, IMAGE_EXTS, "image/jpeg");
          contentParts.push({ type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } });
        }

        if (opts.audio) {
          const absPath = resolve(opts.audio);
          if (!existsSync(absPath)) { error(`Audio not found: ${opts.audio}`); process.exit(2); }
          const b64 = readFileSync(absPath).toString("base64");
          const ext = absPath.split(".").pop() || "wav";
          contentParts.push({ type: "input_audio", input_audio: { data: b64, format: ext } });
        }

        if (opts.video) {
          const absPath = resolve(opts.video);
          if (!existsSync(absPath)) { error(`Video not found: ${opts.video}`); process.exit(2); }
          const b64 = readFileSync(absPath).toString("base64");
          const ext = absPath.split(".").pop() || "mp4";
          contentParts.push({ type: "input_video", input_video: { data: b64, format: ext } });
        }

        if (contentParts.length === 0) {
          error("Error: No input provided.");
          process.exit(2);
        }

        input = [{ content: contentParts }];
      }
      // Batch mode
      else if (opts.batch) {
        const texts: string[] = [];
        for (const filePath of opts.batch) {
          const absPath = resolve(filePath);
          if (!existsSync(absPath)) { error(`File not found: ${filePath}`); process.exit(2); }
          texts.push(readFileSync(absPath, "utf-8").trim());
        }
        input = texts;
      }
      // File input
      else if (opts.inputFile) {
        const absPath = resolve(opts.inputFile);
        if (!existsSync(absPath)) { error(`File not found: ${opts.inputFile}`); process.exit(2); }
        input = readFileSync(absPath, "utf-8").trim();
      }
      // Text input
      else {
        let text = opts.input ?? inputParts.join(" ");
        if (!text || !text.trim()) {
          if (!process.stdin.isTTY) {
            text = await readStdin();
          }
          if (!text || !text.trim()) {
            error("Error: No input provided. Pass as argument, --input, --input-file, or pipe via stdin.");
            process.exit(2);
          }
        }
        input = text.trim();
      }

      // ── Build request ───────────────────────────────────────────────
      const body: EmbeddingsRequest = {
        input,
        model: opts.model,
      };

      if (opts.dimensions) body.dimensions = opts.dimensions;
      if (opts.formatOut) body.encoding_format = opts.formatOut;
      if (opts.inputType) body.input_type = opts.inputType;

      const inputDesc = Array.isArray(input)
        ? `${input.length} input(s)`
        : `${(input as string).length} chars`;

      const spinner = opts.quiet ? null : ora(`Embedding ${inputDesc} with ${opts.model}...`).start();
      const startTime = Date.now();

      try {
        const res = await apiFetch(EMBEDDINGS_API, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/or-cli",
            "X-Title": "or-cli",
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          spinner?.fail(`Failed: ${res.status}`);
          try {
            const parsed = JSON.parse(errBody);
            console.error(chalk.red(JSON.stringify(parsed, null, 2)));
          } catch {
            console.error(chalk.red(errBody));
          }
          process.exit(1);
        }

        const result = (await res.json()) as EmbeddingsResponse;
        const latencyMs = Date.now() - startTime;
        spinner?.stop();

        if (format === "json") {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (opts.quiet) {
          // Just output the first embedding vector, one value per line
          const emb = result.data[0]?.embedding;
          if (Array.isArray(emb)) {
            console.log(emb.join("\n"));
          } else {
            console.log(emb);
          }
          return;
        }

        // Pretty print
        console.log("");
        console.log(chalk.bold(`  Embedding Results`));
        console.log(chalk.dim(`  Model: ${result.model}`));
        console.log(chalk.dim(`  Embeddings: ${result.data.length}`));
        console.log("");

        for (const item of result.data) {
          const emb = item.embedding;
          const dim = Array.isArray(emb) ? emb.length : "(base64)";
          const preview = Array.isArray(emb)
            ? `[${emb.slice(0, 5).map((n) => n.toFixed(6)).join(", ")}${emb.length > 5 ? ", ..." : ""}]`
            : (emb as string).slice(0, 60) + "...";

          console.log(`  [${item.index}] ${chalk.cyan(`${dim}d`)} ${chalk.dim(preview)}`);
        }

        console.log("");
        const usageParts: string[] = [];
        if (result.usage.total_tokens) usageParts.push(`${result.usage.total_tokens} tokens`);
        if (result.usage.cost) usageParts.push(formatDollars(result.usage.cost));
        usageParts.push(`${latencyMs}ms`);
        console.log(chalk.dim(`  ${usageParts.join(" • ")}`));
        console.log("");
      } catch (err) {
        spinner?.fail("Embedding failed");
        error(formatNetworkError(err));
        process.exit(1);
      }
    });

  return cmd;
}
