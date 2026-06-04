import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { requireOpenRouterKey } from "../lib/config";
import { getCached, setCache } from "../lib/cache";
import { getConfig } from "../lib/config";
import { getFormat, outputTable, truncate } from "../lib/format";
import type { GlobalOptions } from "../lib/types";

interface RankingEntry {
  date: string;
  model_permaslug: string;
  total_tokens: string;
}

interface RankingsMeta {
  as_of: string;
  version: string;
  start_date: string;
  end_date: string;
}

export function rankingsCommand(): Command {
  const cmd = new Command("rankings")
    .description("View daily token usage rankings for top models on OpenRouter")
    .option("--date <date>", "Specific date (YYYY-MM-DD)")
    .option("--model <model>", "Filter by model slug")
    .option("-n, --limit <n>", "Max results", parseInt, 25)
    .option("--sort <field>", "Sort by: tokens, model, date", "tokens")
    .option("--json", "Output as JSON")
    .option("--md", "Output as Markdown table")
    .option("--no-cache", "Bypass cache")
    .action(async (opts: GlobalOptions & {
      date?: string;
      model?: string;
      limit?: number;
      sort?: string;
    }) => {
      const apiKey = requireOpenRouterKey();
      const format = getFormat(opts);
      const cacheTtl = getConfig().cacheTtlMs;

      const spinner = ora("Fetching rankings...").start();

      try {
        let data: { data: RankingEntry[]; meta: RankingsMeta };

        if (!opts.noCache) {
          const cached = getCached<{ data: RankingEntry[]; meta: RankingsMeta }>("rankings-daily", {}, cacheTtl);
          if (cached) {
            data = cached;
          } else {
            data = await fetchRankings(apiKey);
            setCache("rankings-daily", {}, data, cacheTtl);
          }
        } else {
          data = await fetchRankings(apiKey);
        }

        let entries = data.data;

        // Apply filters
        if (opts.date) {
          entries = entries.filter((e) => e.date === opts.date);
        }
        if (opts.model) {
          const q = opts.model.toLowerCase();
          entries = entries.filter((e) => e.model_permaslug.toLowerCase().includes(q));
        }

        // Sort
        switch (opts.sort) {
          case "model":
            entries.sort((a, b) => a.model_permaslug.localeCompare(b.model_permaslug));
            break;
          case "date":
            entries.sort((a, b) => b.date.localeCompare(a.date));
            break;
          case "tokens":
          default:
            entries.sort((a, b) => parseInt(b.total_tokens) - parseInt(a.total_tokens));
            break;
        }

        // Limit
        entries = entries.slice(0, opts.limit);

        spinner.stop();

        if (entries.length === 0) {
          console.log(chalk.dim("No ranking data matches your filters."));
          return;
        }

        if (format === "json") {
          console.log(JSON.stringify({
            meta: data.meta,
            entries,
          }, null, 2));
          return;
        }

        // Aggregate by model if no specific date
        if (!opts.date) {
          const byModel = new Map<string, { tokens: number; days: number }>();
          for (const e of entries) {
            const existing = byModel.get(e.model_permaslug) ?? { tokens: 0, days: 0 };
            existing.tokens += parseInt(e.total_tokens);
            existing.days += 1;
            byModel.set(e.model_permaslug, existing);
          }

          const aggregated = [...byModel.entries()]
            .map(([model, data]) => ({
              model,
              totalTokens: data.tokens,
              avgTokens: Math.round(data.tokens / data.days),
              days: data.days,
            }))
            .sort((a, b) => b.totalTokens - a.totalTokens)
            .slice(0, opts.limit);

          const headers = ["Model", "Total Tokens", "Avg/Day", "Days"];
          const rows = aggregated.map((a) => [
            truncate(a.model, 45),
            formatTokens(a.totalTokens),
            formatTokens(a.avgTokens),
            String(a.days),
          ]);

          outputTable(headers, rows, format);

          if (format === "table") {
            console.log(chalk.dim(`\n  ${aggregated.length} models shown`));
            console.log(chalk.dim(`  Period: ${data.meta.start_date} to ${data.meta.end_date}`));
            console.log(chalk.dim("  Data: OpenRouter Rankings API"));
          }
        } else {
          // Show specific date
          const headers = ["Rank", "Model", "Tokens"];
          const rows = entries.map((e, i) => [
            String(i + 1),
            truncate(e.model_permaslug, 50),
            formatTokens(parseInt(e.total_tokens)),
          ]);

          outputTable(headers, rows, format);

          if (format === "table") {
            console.log(chalk.dim(`\n  ${entries.length} models on ${opts.date}`));
          }
        }
      } catch (err) {
        spinner.fail("Failed to fetch rankings");
        console.error(chalk.red(String(err)));
        process.exit(1);
      }
    });

  return cmd;
}

async function fetchRankings(apiKey: string) {
  const res = await fetch("https://openrouter.ai/api/v1/datasets/rankings-daily", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch rankings: ${res.status}`);
  }
  return res.json() as Promise<{ data: RankingEntry[]; meta: RankingsMeta }>;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(1)}B`;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}
