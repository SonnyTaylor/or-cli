import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { requireOpenRouterKey } from "../lib/config";
import { rerank, fetchModels, isRerankModel } from "../lib/openrouter";
import { formatNetworkError } from "../lib/fetch";
import { getFormat, outputTable, formatDollars } from "../lib/format";
import type { GlobalOptions, RerankResponse } from "../lib/types";

export function rerankCommand(): Command {
  const cmd = new Command("rerank")
    .description("Rerank documents by relevance to a query")
    .argument("<query>", "Search query")
    .argument("[documents...]", "Documents to rerank (strings or @file paths)")
    .option("-m, --model <model>", "Rerank model to use", "cohere/rerank-v3.5")
    .option("-n, --top-n <n>", "Number of top results to return", parseInt)
    .option("-f, --file <path>", "Read documents from file (one per line)")
    .option("--json", "Output as JSON")
    .option("--md", "Output as Markdown table")
    .option("--quiet", "Suppress non-error output")
    .action(async (query: string, docsArg: string[], opts: GlobalOptions & { model: string; topN?: number; file?: string }) => {
      const apiKey = requireOpenRouterKey();
      const format = getFormat(opts);

      // ── Collect documents ─────────────────────────────────────────────
      const documents: string[] = [];

      // From positional args
      for (const d of docsArg || []) {
        if (d.startsWith("@")) {
          const path = d.slice(1);
          documents.push(...readDocFile(path));
        } else {
          documents.push(d);
        }
      }

      // From --file
      if (opts.file) {
        documents.push(...readDocFile(opts.file));
      }

      // From stdin
      if (documents.length === 0 && !process.stdin.isTTY) {
        const stdin = await readStdin();
        if (stdin) {
          documents.push(...stdin.split("\n").map((l) => l.trim()).filter(Boolean));
        }
      }

      if (documents.length === 0) {
        console.log(chalk.yellow("⚠ No documents provided."));
        console.log(chalk.dim("  Pass documents as arguments, use --file, or pipe them in."));
        console.log("");
        console.log(chalk.dim("  Examples:"));
        console.log(chalk.dim("    or rerank 'capital of France?' 'Paris...' 'Berlin...'"));
        console.log(chalk.dim("    or rerank 'query' --file docs.txt"));
        console.log(chalk.dim("    cat docs.txt | or rerank 'query'"));
        process.exit(1);
      }

      // ── Validate model ────────────────────────────────────────────────
      const spinner = opts.quiet ? null : ora(`Reranking ${documents.length} document(s)...`).start();

      try {
        // Quick check that the model exists and is a reranker
        const models = await fetchModels(apiKey);
        const modelInfo = models.find((m) => m.id === opts.model);
        if (!modelInfo) {
          spinner?.warn(`Model not found: ${opts.model}`);
        } else if (!isRerankModel(modelInfo)) {
          spinner?.warn(`${opts.model} does not appear to be a rerank model`);
        }

        const response = await rerank(apiKey, {
          query,
          documents,
          model: opts.model,
          top_n: opts.topN,
        });

        spinner?.stop();

        if (format === "json") {
          console.log(JSON.stringify(response, null, 2));
          return;
        }

        printResults(response, format);
      } catch (err) {
        spinner?.fail("Rerank failed");
        console.error(chalk.red(formatNetworkError(err)));
        process.exit(1);
      }
    });

  return cmd;
}

function readDocFile(filePath: string): string[] {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    console.error(chalk.red(`✗ File not found: ${filePath}`));
    process.exit(1);
  }
  return readFileSync(absPath, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function readStdin(): Promise<string> {
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

function printResults(res: RerankResponse, format: "table" | "json" | "md"): void {
  const headers = ["Rank", "Score", "Document"];
  const rows = res.results.map((r, i) => {
    const text = r.document.text;
    const truncated = text.length > 80 ? text.slice(0, 77) + "..." : text;
    return [
      String(i + 1),
      r.relevance_score.toFixed(4),
      truncated,
    ];
  });

  console.log("");
  console.log(chalk.bold(`  Rerank Results  —  ${res.model}`));
  if (res.provider) {
    console.log(chalk.dim(`  Provider: ${res.provider}`));
  }
  console.log("");

  outputTable(headers, rows, format);

  console.log("");
  if (res.usage) {
    const parts: string[] = [];
    if (res.usage.total_tokens > 0) parts.push(`${res.usage.total_tokens} tokens`);
    if (res.usage.search_units > 0) parts.push(`${res.usage.search_units} search units`);
    if (res.usage.cost > 0) parts.push(formatDollars(res.usage.cost));
    if (parts.length > 0) {
      console.log(chalk.dim(`  Usage: ${parts.join(", ")}`));
    }
  }
  console.log("");
}
