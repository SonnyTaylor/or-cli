import { Command } from "commander";
import chalk from "chalk";
import {
  readHistory,
  searchHistory,
  getHistoryEntry,
  clearHistory,
  historyStats,
} from "../lib/history";
import { getFormat, outputTable, formatPriceStr, truncate } from "../lib/format";
import type { GlobalOptions } from "../lib/types";

export function historyCommand(): Command {
  const cmd = new Command("history")
    .description("View and manage chat history");

  // or history — list recent
  cmd
    .command("list")
    .description("Show recent chat history")
    .option("-n, --limit <n>", "Number of entries", parseInt, 20)
    .option("--json", "Output as JSON")
    .option("--md", "Output as Markdown table")
    .option("--quiet", "Suppress non-error output")
    .action((opts: GlobalOptions & { limit?: number }) => {
      const entries = readHistory(opts.limit);
      const format = getFormat(opts);

      if (entries.length === 0) {
        console.log(chalk.dim("No chat history yet. Use `or chat` to get started."));
        return;
      }

      if (format === "json") {
        console.log(JSON.stringify(entries, null, 2));
        return;
      }

      const headers = ["ID", "Time", "Model", "Prompt", "Tokens", "Cost", "Latency"];
      const rows = entries.map((e) => [
        e.id,
        formatTime(e.timestamp),
        truncate(e.model.split("/").pop() ?? e.model, 25),
        truncate(e.prompt, 50),
        String(e.usage.totalTokens),
        e.costEstimate !== undefined ? `$${e.costEstimate.toFixed(4)}` : "—",
        `${e.latencyMs}ms`,
      ]);

      outputTable(headers, rows, format);

      if (format === "table") {
        console.log(chalk.dim(`\n  ${entries.length} entries shown. Use \`or history show <id>\` for full details.`));
      }
    });

  // or history show <id>
  cmd
    .command("show")
    .description("Show full details of a chat entry")
    .argument("<id>", "History entry ID")
    .option("--json", "Output as JSON")
    .action((id: string, opts: { json?: boolean }) => {
      const entry = getHistoryEntry(id);
      if (!entry) {
        console.error(chalk.red(`No history entry found with ID: ${id}`));
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify(entry, null, 2));
        return;
      }

      console.log("");
      console.log(chalk.bold(`History entry: ${entry.id}`));
      console.log(chalk.dim(`  ${entry.timestamp}`));
      console.log("");

      console.log(chalk.bold("  Model") + `  ${entry.model}`);
      if (entry.provider) console.log(chalk.dim(`  Provider: ${entry.provider}`));
      console.log("");

      if (entry.systemPrompt) {
        console.log(chalk.bold("  System prompt:"));
        console.log(`    ${entry.systemPrompt}`);
        console.log("");
      }

      console.log(chalk.bold("  Prompt:"));
      console.log(`    ${entry.prompt}`);
      console.log("");

      console.log(chalk.bold("  Response:"));
      console.log(`    ${entry.response}`);
      console.log("");

      console.log(chalk.bold("  Stats"));
      console.log(`    Tokens:     ${entry.usage.totalTokens} (${entry.usage.promptTokens} in / ${entry.usage.completionTokens} out)`);
      if (entry.costEstimate !== undefined) console.log(`    Cost:       $${entry.costEstimate.toFixed(6)}`);
      console.log(`    Latency:    ${entry.latencyMs}ms`);
      if (entry.temperature !== undefined) console.log(`    Temperature: ${entry.temperature}`);
      if (entry.maxTokens !== undefined) console.log(`    Max tokens: ${entry.maxTokens}`);
      if (entry.finishReason) console.log(`    Finish:     ${entry.finishReason}`);
      console.log("");
    });

  // or history search <query>
  cmd
    .command("search")
    .description("Search chat history")
    .argument("<query>", "Search query (matches prompt, response, model)")
    .option("-n, --limit <n>", "Max results", parseInt, 10)
    .option("--json", "Output as JSON")
    .action((query: string, opts: GlobalOptions & { limit?: number }) => {
      const entries = searchHistory(query, opts.limit);
      const format = getFormat(opts);

      if (entries.length === 0) {
        console.log(chalk.dim(`No history entries matching "${query}"`));
        return;
      }

      if (format === "json") {
        console.log(JSON.stringify(entries, null, 2));
        return;
      }

      const headers = ["ID", "Time", "Model", "Prompt", "Tokens"];
      const rows = entries.map((e) => [
        e.id,
        formatTime(e.timestamp),
        truncate(e.model.split("/").pop() ?? e.model, 25),
        truncate(e.prompt, 50),
        String(e.usage.totalTokens),
      ]);

      outputTable(headers, rows, format);
      console.log(chalk.dim(`\n  ${entries.length} matches`));
    });

  // or history stats
  cmd
    .command("stats")
    .description("Show usage statistics")
    .option("--json", "Output as JSON")
    .action((opts: { json?: boolean }) => {
      const stats = historyStats();

      if (opts.json) {
        console.log(JSON.stringify({
          totalEntries: stats.totalEntries,
          totalTokens: stats.totalTokens,
          totalCost: stats.totalCost,
          models: Object.fromEntries(stats.models),
        }, null, 2));
        return;
      }

      console.log(chalk.bold("\nChat history stats:\n"));
      console.log(`  Total conversations: ${stats.totalEntries}`);
      console.log(`  Total tokens used:   ${stats.totalTokens.toLocaleString()}`);
      console.log(`  Total cost:          $${stats.totalCost.toFixed(4)}`);

      if (stats.models.size > 0) {
        console.log("");
        console.log(chalk.bold("  Models used:"));
        const sorted = [...stats.models.entries()].sort((a, b) => b[1] - a[1]);
        for (const [model, count] of sorted) {
          console.log(`    ${truncate(model, 40)}  ×${count}`);
        }
      }
      console.log("");
    });

  // or history clear
  cmd
    .command("clear")
    .description("Clear all chat history")
    .option("--confirm", "Skip confirmation prompt")
    .action(async (opts: { confirm?: boolean }) => {
      if (!opts.confirm && process.stdin.isTTY) {
        const { createInterface } = await import("readline");
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>((resolve) =>
          rl.question(chalk.yellow("Clear all chat history? [y/N] "), resolve)
        );
        rl.close();
        if (answer.toLowerCase() !== "y") {
          console.log(chalk.dim("Cancelled."));
          return;
        }
      }

      const count = clearHistory();
      console.log(chalk.green("✓") + ` Cleared ${count} history entries`);
    });

  return cmd;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}
