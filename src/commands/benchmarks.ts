import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getAAKey } from "../lib/config";
import { fetchLLMBenchmarks, fetchMediaBenchmarks } from "../lib/artificial-analysis";
import { getFormat, outputTable, formatPriceStr, formatTps, truncate } from "../lib/format";
import type { AAMediaEndpoint, GlobalOptions, AAModel } from "../lib/types";

export function benchmarksCommand(): Command {
  const cmd = new Command("benchmarks")
    .description("View Artificial Analysis benchmark data")
    .option("--type <category>", "Category: llm, text-to-image, image-editing, text-to-speech, text-to-video, image-to-video", "llm")
    .option("--sort <field>", "Sort by: score, coding, intelligence, math, speed, price, ttft, name", "score")
    .option("-n, --limit <n>", "Max results", parseInt)
    .option("--detailed", "Show all benchmark columns (LLM only)")
    .option("--json", "Output as JSON")
    .option("--md", "Output as Markdown table")
    .option("--no-cache", "Bypass cache, fetch fresh data")
    .option("--list-types", "List available benchmark categories")
    .action(async (opts: GlobalOptions & {
      type?: string;
      sort?: string;
      limit?: number;
      detailed?: boolean;
      listTypes?: boolean;
    }) => {
      if (opts.listTypes) {
        console.log(chalk.bold("Available benchmark categories:\n"));
        console.log("  llm              Language models (15 benchmarks + speed/latency)");
        console.log("  text-to-image    Image generation models (ELO ratings, 142 models)");
        console.log("  image-editing    Image editing models (ELO ratings, 64 models)");
        console.log("  text-to-speech   Text-to-speech models (ELO ratings, 84 models)");
        console.log("  text-to-video    Text-to-video models (ELO ratings, 83 models)");
        console.log("  image-to-video   Image-to-video models (ELO ratings, 76 models)");
        console.log("");
        console.log(chalk.dim("LLM benchmarks include: intelligence, coding, math, MMLU Pro, GPQA, HLE,"));
        console.log(chalk.dim("  LiveCodeBench, SciCode, MATH 500, AIME, AIME 25, IFBench, LCR, TerminalBench, TAU2"));
        return;
      }

      const aaKey = getAAKey();
      if (!aaKey) {
        console.error(
          chalk.red("Error: No Artificial Analysis API key found.\n") +
          "Run `or auth --aa-key <key>` to set your key."
        );
        process.exit(1);
      }

      const format = getFormat(opts);
      const type = opts.type ?? "llm";
      const spinner = ora(`Fetching ${type} benchmarks...`).start();

      try {
        if (type === "llm") {
          await showLLMBenchmarks(aaKey, opts, format, spinner);
        } else {
          await showMediaBenchmarks(aaKey, type as AAMediaEndpoint, opts, format, spinner);
        }
      } catch (err) {
        spinner.fail("Failed to fetch benchmarks");
        console.error(chalk.red(String(err)));
        process.exit(1);
      }
    });

  return cmd;
}

async function showLLMBenchmarks(
  aaKey: string,
  opts: { sort?: string; limit?: number; noCache?: boolean; detailed?: boolean },
  format: "table" | "json" | "md",
  spinner: ReturnType<typeof ora>
) {
  const models = await fetchLLMBenchmarks(aaKey, opts.noCache);
  spinner.stop();

  // Sort
  const sorted = [...models].sort((a, b) => {
    switch (opts.sort) {
      case "speed":
        return (b.median_output_tokens_per_second ?? 0) - (a.median_output_tokens_per_second ?? 0);
      case "ttft":
        return (a.median_time_to_first_token_seconds ?? 999) - (b.median_time_to_first_token_seconds ?? 999);
      case "price":
        return (a.pricing.price_1m_blended_3_to_1 ?? 999) - (b.pricing.price_1m_blended_3_to_1 ?? 999);
      case "intelligence":
        return (b.evaluations.artificial_analysis_intelligence_index ?? 0) - (a.evaluations.artificial_analysis_intelligence_index ?? 0);
      case "math":
        return (b.evaluations.artificial_analysis_math_index ?? 0) - (a.evaluations.artificial_analysis_math_index ?? 0);
      case "coding":
        return (b.evaluations.artificial_analysis_coding_index ?? 0) - (a.evaluations.artificial_analysis_coding_index ?? 0);
      case "name":
        return a.name.localeCompare(b.name);
      case "score":
      default:
        return (b.evaluations.artificial_analysis_coding_index ?? 0) -
               (a.evaluations.artificial_analysis_coding_index ?? 0);
    }
  });

  const limited = opts.limit ? sorted.slice(0, opts.limit) : sorted;

  if (format === "json") {
    console.log(JSON.stringify(limited, null, 2));
    return;
  }

  if (opts.detailed) {
    // Show all 15 benchmarks
    const headers = [
      "Model", "Creator", "Intel", "Coding", "Math",
      "MMLU", "GPQA", "HLE", "LCB", "SciCode",
      "MATH500", "AIME", "AIME25", "IFBench", "LCR", "TermBench", "TAU2",
      "Speed", "TTFT", "Price/M"
    ];
    const rows = limited.map((m) => {
      const e = m.evaluations;
      return [
        truncate(m.name, 25),
        m.model_creator.name.slice(0, 8),
        fmt(e.artificial_analysis_intelligence_index),
        fmt(e.artificial_analysis_coding_index),
        fmt(e.artificial_analysis_math_index),
        fmtPct(e.mmlu_pro),
        fmtPct(e.gpqa),
        fmtPct(e.hle),
        fmtPct(e.livecodebench),
        fmtPct(e.scicode),
        fmtPct(e.math_500),
        fmtPct(e.aime),
        fmtPct(e.aime_25),
        fmtPct(e.ifbench),
        fmtPct(e.lcr),
        fmtPct(e.terminalbench_hard),
        fmtPct(e.tau2),
        m.median_output_tokens_per_second ? formatTps(m.median_output_tokens_per_second) : "—",
        m.median_time_to_first_token_seconds ? `${m.median_time_to_first_token_seconds.toFixed(1)}s` : "—",
        m.pricing.price_1m_blended_3_to_1 ? formatPriceStr(m.pricing.price_1m_blended_3_to_1) : "—",
      ];
    });

    outputTable(headers, rows, format);
  } else {
    // Compact view
    const headers = ["Model", "Creator", "Coding", "Intel", "Math", "GPQA", "Speed", "TTFT", "Price/M"];
    const rows = limited.map((m) => [
      truncate(m.name, 30),
      m.model_creator.name,
      m.evaluations.artificial_analysis_coding_index?.toFixed(0) ?? "—",
      m.evaluations.artificial_analysis_intelligence_index?.toFixed(0) ?? "—",
      m.evaluations.artificial_analysis_math_index?.toFixed(0) ?? "—",
      m.evaluations.gpqa ? (m.evaluations.gpqa * 100).toFixed(0) + "%" : "—",
      m.median_output_tokens_per_second ? formatTps(m.median_output_tokens_per_second) : "—",
      m.median_time_to_first_token_seconds ? `${m.median_time_to_first_token_seconds.toFixed(1)}s` : "—",
      m.pricing.price_1m_blended_3_to_1 ? formatPriceStr(m.pricing.price_1m_blended_3_to_1) : "—",
    ]);

    outputTable(headers, rows, format);
  }

  if (format === "table") {
    console.log(chalk.dim(`\n  ${limited.length} models shown`));
    console.log(chalk.dim("  Use --detailed for all 15 benchmark columns"));
    console.log(chalk.dim("  Data: Artificial Analysis (artificialanalysis.ai)"));
  }
}

async function showMediaBenchmarks(
  aaKey: string,
  endpoint: AAMediaEndpoint,
  opts: { sort?: string; limit?: number; noCache?: boolean },
  format: "table" | "json" | "md",
  spinner: ReturnType<typeof ora>
) {
  const models = await fetchMediaBenchmarks(aaKey, endpoint, opts.noCache);
  spinner.stop();

  // Sort
  const sorted = [...models].sort((a, b) => {
    switch (opts.sort) {
      case "name":
        return a.name.localeCompare(b.name);
      case "appearances":
        return (b.appearances ?? 0) - (a.appearances ?? 0);
      case "score":
      default:
        return b.elo - a.elo;
    }
  });

  const limited = opts.limit ? sorted.slice(0, opts.limit) : sorted;

  if (format === "json") {
    console.log(JSON.stringify(limited, null, 2));
    return;
  }

  const headers = ["Model", "Creator", "ELO", "Rank", "95% CI", "Appearances", "Released"];
  const rows = limited.map((m) => [
    truncate(m.name, 30),
    m.model_creator.name,
    String(m.elo),
    String(m.rank),
    m.ci95 ?? "—",
    m.appearances?.toLocaleString() ?? "—",
    m.release_date ?? "—",
  ]);

  outputTable(headers, rows, format);

  if (format === "table") {
    console.log(chalk.dim(`\n  ${limited.length} models shown`));
    console.log(chalk.dim("  Data: Artificial Analysis (artificialanalysis.ai)"));
  }
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toFixed(0);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return (n * 100).toFixed(0) + "%";
}
