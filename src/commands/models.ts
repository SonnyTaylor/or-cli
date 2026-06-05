import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { requireOpenRouterKey, getAAKey } from "../lib/config";
import {
  fetchModels,
  modelMatchesSearch,
  getModelModality,
  hasTools,
  hasReasoning,
  isVisionModel,
  isTextModel,
  isImageGenModel,
  isEmbeddingModel,
  isAudioModel,
  isAudioGenModel,
  isVideoModel,
  isRerankModel,
  isTranscriptionModel,
  isSpeechModel,
  getPrimaryPrice,
} from "../lib/openrouter";
import { fetchLLMBenchmarks, fetchMediaBenchmarks } from "../lib/artificial-analysis";
import { getFormat, outputTable, modalityEmoji, formatCtx, error } from "../lib/format";
import { formatNetworkError } from "../lib/fetch";
import type { ORModel, AAModel, GlobalOptions } from "../lib/types";

interface FilterOptions extends GlobalOptions {
  type?: string;
  tools?: boolean;
  reasoning?: boolean;
  vision?: boolean;
  free?: boolean;
  maxCost?: number;
  minContext?: number;
  provider?: string;
  sort?: string;
  limit?: number;
  benchmarks?: boolean;
  param?: string[];
  expiring?: boolean;
  new?: boolean;
  tilde?: boolean;
}

export function modelsCommand(): Command {
  const cmd = new Command("models")
    .description("List, search, and filter available models")
    .argument("[query]", "Search query (matches model id, name, description)")
    .option("-t, --type <type>", "Filter by modality: text, image, vision, embedding, audio, audio-in, audio-out, audio-gen, video, rerank, transcription")
    .option("--tools", "Only models with tool/function calling support")
    .option("--reasoning", "Only reasoning models (o1, o3, r1, qwq, etc)")
    .option("--vision", "Only vision/multimodal models")
    .option("-f, --free", "Only free models")
    .option("--max-cost <n>", "Max combined price per 1M tokens", parseFloat)
    .option("-c, --min-context <n>", "Minimum context window", parseInt)
    .option("-p, --provider <name>", "Filter by provider name prefix in model ID")
    .option("--param <param...>", "Filter by supported parameter (e.g. tools, reasoning, response_format, structured_outputs)")
    .option("-s, --sort <field>", "Sort by: price, context, name, created, usage, rank", "name")
    .option("-n, --limit <n>", "Max results", parseInt)
    .option("--expiring", "Only models with an expiration date (going away soon)")
    .option("--new", "Only models added in the last 30 days")
    .option("--tilde", "Include ~ prefix 'latest' alias models")
    .option("--benchmarks", "Include AA benchmark scores (requires AA API key)")
    .option("--json", "Output as JSON")
    .option("--md", "Output as Markdown table")
    .option("--quiet", "Suppress non-error output")
    .option("--no-cache", "Bypass cache, fetch fresh data")
    .action(async (query: string | undefined, opts: FilterOptions) => {
      const apiKey = requireOpenRouterKey();
      const format = getFormat(opts);

      const spinner = opts.quiet ? null : ora("Fetching models...").start();

      try {
        // For usage/rank sorting, we need to fetch with the sort param from the API
        const apiSort = opts.sort === 'usage' || opts.sort === 'rank' ? opts.sort : undefined;
        let models = await fetchModels(apiKey, opts.noCache, apiSort);

        // Apply search query
        if (query) {
          models = models.filter((m) => modelMatchesSearch(m, query));
        }

        // Apply type filter
        if (opts.type) {
          models = filterByType(models, opts.type);
        }

        // Apply capability filters
        if (opts.tools) models = models.filter(hasTools);
        if (opts.reasoning) models = models.filter(hasReasoning);
        if (opts.vision) models = models.filter(isVisionModel);
        if (opts.free) models = models.filter((m) => getPrimaryPrice(m).sortValue === 0);
        if (opts.maxCost !== undefined) models = models.filter((m) => getPrimaryPrice(m).sortValue <= opts.maxCost!);
        if (opts.minContext) models = models.filter((m) => m.context_length >= opts.minContext!);
        if (opts.provider) {
          const prov = opts.provider.toLowerCase();
          models = models.filter((m) => m.id.toLowerCase().includes(prov));
        }

        // Filter by supported parameters
        if (opts.param && opts.param.length > 0) {
          models = models.filter((m) =>
            opts.param!.every((p) => m.supported_parameters?.includes(p))
          );
        }

        // Filter expiring models
        if (opts.expiring) {
          models = models.filter((m) => m.expiration_date);
        }

        // Filter new models (added in last 30 days)
        if (opts.new) {
          const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
          models = models.filter((m) => m.created && m.created > thirtyDaysAgo);
        }

        // Filter out ~ prefix 'latest' aliases by default
        if (!opts.tilde) {
          models = models.filter((m) => !m.id.startsWith('~'));
        }

        // Sort
        models = sortModels(models, opts.sort ?? "name");

        // Limit
        if (opts.limit) {
          models = models.slice(0, opts.limit);
        }

        // Optionally fetch benchmarks
        let benchmarks: Map<string, AAModel> | null = null;
        if (opts.benchmarks) {
          const aaKey = getAAKey();
          if (aaKey) {
            try {
              const aaModels = await fetchLLMBenchmarks(aaKey, opts.noCache);
              benchmarks = new Map(aaModels.map((m) => [m.slug, m]));
            } catch (err) {
              spinner?.warn(`Could not fetch benchmarks: ${err}`);
            }
          } else {
            spinner?.warn("No AA API key set. Run `or auth --aa-key <key>` to enable benchmarks.");
          }
        }

        spinner?.stop();

        if (models.length === 0) {
          console.log(chalk.dim("No models match your filters."));
          return;
        }

        // JSON output: return raw API data for programmatic use
        if (format === "json") {
          console.log(JSON.stringify(models, null, 2));
          return;
        }

        // Build output
        const headers = benchmarks
          ? ["Model", "Modality", "Price", "Context", "🔧", "Coding", "Intel", "Speed"]
          : ["Model", "Modality", "Price", "Context", "🔧", "🧠"];

        const rows = models.map((m) => {
          const priceDisplay = getPrimaryPrice(m).display;
          const base = [
            m.id,
            modalityEmoji(getModelModality(m)) + " " + getModelModality(m),
            priceDisplay,
            formatCtx(m.context_length),
            hasTools(m) ? "✓" : "",
          ];

          if (benchmarks) {
            const bm = benchmarks.get(m.id.split("/").pop() ?? "");
            base.push(
              bm?.evaluations?.artificial_analysis_coding_index?.toFixed(0) ?? "—",
              bm?.evaluations?.artificial_analysis_intelligence_index?.toFixed(0) ?? "—",
              bm?.median_output_tokens_per_second?.toFixed(0) ?? "—"
            );
          } else {
            base.push(hasReasoning(m) ? "✓" : "");
          }

          return base;
        });

        // Quiet: output just model IDs
        if (opts.quiet && format === "table") {
          for (const m of models) {
            console.log(m.id);
          }
          return;
        }

        outputTable(headers, rows, format);

        if (format === "table" && !opts.quiet) {
          console.log(chalk.dim(`\n  ${models.length} models shown`));
        }
      } catch (err) {
        spinner?.fail("Failed to fetch models");
        error(formatNetworkError(err));
        process.exit(1);
      }
    });

  return cmd;
}

function filterByType(models: ORModel[], type: string): ORModel[] {
  switch (type.toLowerCase()) {
    case "text": return models.filter(isTextModel);
    case "image": return models.filter(isImageGenModel);
    case "vision": return models.filter(isVisionModel);
    case "embedding": case "embed": return models.filter(isEmbeddingModel);
    case "audio": return models.filter(isAudioModel);
    case "audio-in": return models.filter((m) => {
      const mod = getModelModality(m);
      const [input, output] = mod.split("->");
      return (input?.includes("audio") ?? false) && (output?.includes("text") ?? false);
    });
    case "audio-out": return models.filter(isAudioGenModel);
    case "audio-gen": return models.filter(isAudioGenModel);
    case "speech": case "tts": return models.filter(isSpeechModel);
    case "video": return models.filter(isVideoModel);
    case "rerank": return models.filter(isRerankModel);
    case "transcription": case "stt": return models.filter(isTranscriptionModel);
    default:
      console.log(chalk.yellow(`Unknown type "${type}". Valid: text, image, vision, embedding, audio, audio-in, audio-out, audio-gen, speech, video, rerank, transcription`));
      return models;
  }
}

function sortModels(models: ORModel[], sort: string): ORModel[] {
  switch (sort) {
    case "price":
      return [...models].sort((a, b) => {
        return getPrimaryPrice(a).sortValue - getPrimaryPrice(b).sortValue;
      });
    case "context":
      return [...models].sort((a, b) => b.context_length - a.context_length);
    case "created":
      return [...models].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
    case "name":
    default:
      return [...models].sort((a, b) => a.id.localeCompare(b.id));
  }
}


