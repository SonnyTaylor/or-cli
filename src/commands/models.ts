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
import { fetchLLMBenchmarks } from "../lib/artificial-analysis";
import { buildAABenchmarkIndex, type AABenchmarkIndex } from "../lib/model-match";
import { getFormat, outputTable, modalityEmoji, formatCtx, error } from "../lib/format";
import { formatNetworkError } from "../lib/fetch";
import type { ORModel, GlobalOptions } from "../lib/types";

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
    .option("-s, --sort <field>", "Sort by: popular (default), newest, price, context, name, intelligence, coding", "popular")
    .option("-n, --limit <n>", "Max results", parseInt)
    .option("--expiring", "Only models with an expiration date (going away soon)")
    .option("--new", "Only models added in the last 30 days")
    .option("--tilde", "Include ~ prefix 'latest' alias models")
    .option("--benchmarks", "Force AA benchmark columns (default: on when an AA key is set)")
    .option("--no-benchmarks", "Hide AA benchmark columns")
    .option("--json", "Output as JSON")
    .option("--md", "Output as Markdown table")
    .option("--quiet", "Suppress non-error output")
    .option("--no-cache", "Bypass cache, fetch fresh data")
    .action(async (query: string | undefined, opts: FilterOptions) => {
      const apiKey = requireOpenRouterKey();
      const format = getFormat(opts);

      const spinner = opts.quiet ? null : ora("Fetching models...").start();

      try {
        // Popularity/intelligence/coding order comes from the API itself.
        const apiSort = apiSortFor(opts.sort ?? "popular");
        let models = await fetchModels(apiKey, opts.noCache, apiSort);
        const allModels = models; // unfiltered, for benchmark matching

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

        // Sort (API sorts preserve the fetched order)
        models = sortModels(models, opts.sort ?? "popular");

        // Limit
        if (opts.limit) {
          models = models.slice(0, opts.limit);
        }

        // Benchmarks are shown automatically whenever an AA key is available
        // (disable with --no-benchmarks). Matching runs against the full,
        // unfiltered model list so variants resolve correctly.
        let benchmarks: AABenchmarkIndex | null = null;
        const aaKey = getAAKey();
        if (opts.benchmarks !== false && aaKey) {
          try {
            const aaModels = await fetchLLMBenchmarks(aaKey, opts.noCache);
            benchmarks = buildAABenchmarkIndex(aaModels, allModels);
          } catch (err) {
            spinner?.warn(`Could not fetch benchmarks: ${err}`);
          }
        } else if (opts.benchmarks === true && !aaKey) {
          spinner?.warn("No AA API key set. Run `or auth --aa-key <key>` to enable benchmarks.");
        }

        spinner?.stop();

        if (models.length === 0) {
          console.log(chalk.dim("No models match your filters."));
          return;
        }

        // JSON output: raw API data, enriched with matched AA benchmarks
        if (format === "json") {
          const enriched = benchmarks
            ? models.map((m) => {
                const bm = benchmarks!.get(m.id);
                return bm
                  ? {
                      ...m,
                      benchmarks: {
                        aa_slug: bm.slug,
                        intelligence: bm.evaluations.artificial_analysis_intelligence_index ?? null,
                        coding: bm.evaluations.artificial_analysis_coding_index ?? null,
                        math: bm.evaluations.artificial_analysis_math_index ?? null,
                        speed_tps: bm.median_output_tokens_per_second ?? null,
                        ttft_s: bm.median_time_to_first_token_seconds ?? null,
                      },
                    }
                  : m;
              })
            : models;
          console.log(JSON.stringify(enriched, null, 2));
          return;
        }

        // Build output
        const headers = benchmarks
          ? ["Model", "Modality", "Price", "Context", "🔧", "Released", "Intel", "Coding", "Speed"]
          : ["Model", "Modality", "Price", "Context", "🔧", "🧠", "Released"];

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
            const bm = benchmarks.get(m.id);
            base.push(
              formatReleased(m.created),
              bm?.evaluations?.artificial_analysis_intelligence_index?.toFixed(0) ?? "—",
              bm?.evaluations?.artificial_analysis_coding_index?.toFixed(0) ?? "—",
              bm?.median_output_tokens_per_second?.toFixed(0) ?? "—"
            );
          } else {
            base.push(hasReasoning(m) ? "✓" : "", formatReleased(m.created));
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
          console.log(chalk.dim(`\n  ${models.length} models shown (sorted by ${opts.sort ?? "popular"})`));
          if (!benchmarks && !aaKey) {
            console.log(chalk.dim("  Tip: set an Artificial Analysis key (`or auth --aa-key <key>`) to see benchmark columns here."));
          }
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

/** Map CLI sort names to the /models API's sort values. These orderings only
 *  exist server-side (live usage and benchmark ranks). */
function apiSortFor(sort: string): string | undefined {
  switch (sort) {
    case "popular":
    case "usage": // legacy alias
    case "rank":  // legacy alias
      return "top-weekly";
    case "intelligence":
      return "intelligence-high-to-low";
    case "coding":
      return "coding-high-to-low";
    default:
      return undefined;
  }
}

function formatReleased(created: number | undefined): string {
  if (!created) return "—";
  const d = new Date(created * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function sortModels(models: ORModel[], sort: string): ORModel[] {
  switch (sort) {
    case "price":
      return [...models].sort((a, b) => {
        return getPrimaryPrice(a).sortValue - getPrimaryPrice(b).sortValue;
      });
    case "context":
      return [...models].sort((a, b) => b.context_length - a.context_length);
    case "newest":
    case "created": // legacy alias
      return [...models].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
    case "name":
      return [...models].sort((a, b) => a.id.localeCompare(b.id));
    default:
      // API-side sorts (popular, intelligence, coding) — keep fetched order
      return models;
  }
}


