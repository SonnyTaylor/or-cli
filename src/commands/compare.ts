import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { requireOpenRouterKey, getAAKey } from "../lib/config";
import {
  fetchModels,
  combinedPrice,
  hasTools,
  hasReasoning,
  getModelModality,
} from "../lib/openrouter";
import { fetchLLMBenchmarks } from "../lib/artificial-analysis";
import { getFormat, outputTable, formatPriceStr, formatTps, formatCtx, formatDollars, estimateCost } from "../lib/format";
import type { ORModel, AAModel, GlobalOptions } from "../lib/types";

export function compareCommand(): Command {
  const cmd = new Command("compare")
    .description("Compare multiple models side-by-side")
    .argument("<model-ids...>", "Two or more model IDs to compare")
    .option("--benchmarks", "Include AA benchmark scores")
    .option("--cost-estimate", "Show estimated cost per typical coding session (100K in / 50K out)")
    .option("--json", "Output as JSON")
    .option("--md", "Output as Markdown table")
    .option("--no-cache", "Bypass cache")
    .action(async (modelIds: string[], opts: GlobalOptions & { benchmarks?: boolean; costEstimate?: boolean }) => {
      const apiKey = requireOpenRouterKey();
      const format = getFormat(opts);

      const spinner = ora("Fetching models...").start();

      try {
        const allModels = await fetchModels(apiKey, opts.noCache);
        const modelMap = new Map(allModels.map((m) => [m.id, m]));

        const models: ORModel[] = [];
        const notFound: string[] = [];
        for (const id of modelIds) {
          const m = modelMap.get(id);
          if (m) models.push(m);
          else notFound.push(id);
        }

        if (notFound.length > 0) {
          spinner.warn(`Not found: ${notFound.join(", ")}`);
        }

        if (models.length < 2) {
          spinner.fail("Need at least 2 valid models to compare.");
          process.exit(1);
        }

        // Fetch benchmarks if requested
        let benchmarks: Map<string, AAModel> | null = null;
        if (opts.benchmarks) {
          const aaKey = getAAKey();
          if (aaKey) {
            try {
              const aaModels = await fetchLLMBenchmarks(aaKey, opts.noCache);
              benchmarks = new Map(aaModels.map((m) => [m.slug, m]));
            } catch (err) {
              spinner.warn(`Could not fetch benchmarks: ${err}`);
            }
          }
        }

        spinner.stop();

        if (format === "json") {
          const data = models.map((m) => ({
            id: m.id,
            name: m.name,
            modality: getModelModality(m),
            input_price: parseFloat(m.pricing.prompt ?? "0") * 1_000_000,
            output_price: parseFloat(m.pricing.completion ?? "0") * 1_000_000,
            combined_price: combinedPrice(m),
            context_length: m.context_length,
            tools: hasTools(m),
            reasoning: hasReasoning(m),
            benchmarks: benchmarks?.get(m.id.split("/").pop() ?? "") ?? null,
          }));
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        // Build comparison table — rows are attributes, columns are models
        const headers = ["", ...models.map((m) => m.id)];

        const rows: string[][] = [];

        rows.push([
          chalk.bold("Modality"),
          ...models.map((m) => getModelModality(m)),
        ]);

        rows.push([
          chalk.bold("Input/M"),
          ...models.map((m) => formatPriceStr(parseFloat(m.pricing.prompt ?? "0") * 1_000_000)),
        ]);

        rows.push([
          chalk.bold("Output/M"),
          ...models.map((m) => formatPriceStr(parseFloat(m.pricing.completion ?? "0") * 1_000_000)),
        ]);

        rows.push([
          chalk.bold("Combined/M"),
          ...models.map((m) => formatPriceStr(combinedPrice(m))),
        ]);

        rows.push([
          chalk.bold("Context"),
          ...models.map((m) => formatCtx(m.context_length)),
        ]);

        rows.push([
          chalk.bold("Tools"),
          ...models.map((m) => (hasTools(m) ? "✓" : "—")),
        ]);

        rows.push([
          chalk.bold("Reasoning"),
          ...models.map((m) => (hasReasoning(m) ? "✓" : "—")),
        ]);

        if (benchmarks) {
          rows.push([
            chalk.bold("Coding"),
            ...models.map((m) => {
              const bm = benchmarks!.get(m.id.split("/").pop() ?? "");
              return bm?.evaluations?.artificial_analysis_coding_index?.toFixed(0) ?? "—";
            }),
          ]);

          rows.push([
            chalk.bold("Intelligence"),
            ...models.map((m) => {
              const bm = benchmarks!.get(m.id.split("/").pop() ?? "");
              return bm?.evaluations?.artificial_analysis_intelligence_index?.toFixed(0) ?? "—";
            }),
          ]);

          rows.push([
            chalk.bold("Speed (t/s)"),
            ...models.map((m) => {
              const bm = benchmarks!.get(m.id.split("/").pop() ?? "");
              return bm?.median_output_tokens_per_second ? formatTps(bm.median_output_tokens_per_second) : "—";
            }),
          ]);
        }

        // Cost estimate: 100K input + 50K output (typical coding session)
        if (opts.costEstimate) {
          const INPUT_TOKENS = 100_000;
          const OUTPUT_TOKENS = 50_000;
          rows.push([
            chalk.bold(""),
            ...models.map(() => ""),
          ]);
          rows.push([
            chalk.bold(`Cost est (${formatTokens(INPUT_TOKENS)} in / ${formatTokens(OUTPUT_TOKENS)} out)`),
            ...models.map((m) => {
              const input = parseFloat(m.pricing.prompt ?? "0") * 1_000_000;
              const output = parseFloat(m.pricing.completion ?? "0") * 1_000_000;
              const { total } = estimateCost(input, output, INPUT_TOKENS, OUTPUT_TOKENS);
              return chalk.yellow(formatDollars(total));
            }),
          ]);
          rows.push([
            chalk.bold("Cost est (500K in / 100K out)"),
            ...models.map((m) => {
              const input = parseFloat(m.pricing.prompt ?? "0") * 1_000_000;
              const output = parseFloat(m.pricing.completion ?? "0") * 1_000_000;
              const { total } = estimateCost(input, output, 500_000, 100_000);
              return chalk.yellow(formatDollars(total));
            }),
          ]);
        }

        outputTable(headers, rows, format);
      } catch (err) {
        spinner.fail("Failed to fetch models");
        console.error(chalk.red(String(err)));
        process.exit(1);
      }
    });

  return cmd;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}


