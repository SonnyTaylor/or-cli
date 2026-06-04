import { Command } from "commander";
import chalk from "chalk";
import { readHistory } from "../lib/history";
import { getFormat, outputTable, formatPriceStr, truncate } from "../lib/format";
import type { GlobalOptions } from "../lib/types";

interface ModelCost {
  model: string;
  calls: number;
  tokens: number;
  cost: number;
}

interface DailyCost {
  date: string;
  calls: number;
  tokens: number;
  cost: number;
}

export function costCommand(): Command {
  const cmd = new Command("cost")
    .description("View spending breakdown from chat history")
    .option("--by-day", "Group by day instead of model")
    .option("-n, --limit <n>", "Max rows to show", parseInt)
    .option("--json", "Output as JSON")
    .option("--md", "Output as Markdown table")
    .action((opts: GlobalOptions & { byDay?: boolean; limit?: number }) => {
      const format = getFormat(opts);
      const entries = readHistory();

      if (entries.length === 0) {
        console.log(chalk.dim("\n  No history yet. Use `or chat` to get started.\n"));
        return;
      }

      // Aggregate totals
      let totalTokens = 0;
      let totalCost = 0;
      let totalCalls = entries.length;

      for (const e of entries) {
        totalTokens += e.usage.totalTokens;
        totalCost += e.costEstimate ?? 0;
      }

      if (opts.byDay) {
        // Group by day
        const byDay = new Map<string, DailyCost>();
        for (const e of entries) {
          const day = e.timestamp.slice(0, 10); // YYYY-MM-DD
          const existing = byDay.get(day) ?? { date: day, calls: 0, tokens: 0, cost: 0 };
          existing.calls++;
          existing.tokens += e.usage.totalTokens;
          existing.cost += e.costEstimate ?? 0;
          byDay.set(day, existing);
        }

        const sorted = [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
        const limited = opts.limit ? sorted.slice(0, opts.limit) : sorted;

        if (format === "json") {
          console.log(JSON.stringify({ total: { calls: totalCalls, tokens: totalTokens, cost: totalCost }, byDay: limited }, null, 2));
          return;
        }

        const headers = ["Date", "Calls", "Tokens", "Cost"];
        const rows = limited.map((d) => [
          d.date,
          String(d.calls),
          d.tokens.toLocaleString(),
          formatPriceStr(d.cost),
        ]);

        console.log(chalk.bold("\n  Spending by Day\n"));
        outputTable(headers, rows, format);
      } else {
        // Group by model
        const byModel = new Map<string, ModelCost>();
        for (const e of entries) {
          const existing = byModel.get(e.model) ?? { model: e.model, calls: 0, tokens: 0, cost: 0 };
          existing.calls++;
          existing.tokens += e.usage.totalTokens;
          existing.cost += e.costEstimate ?? 0;
          byModel.set(e.model, existing);
        }

        const sorted = [...byModel.values()].sort((a, b) => b.cost - a.cost);
        const limited = opts.limit ? sorted.slice(0, opts.limit) : sorted;

        if (format === "json") {
          console.log(JSON.stringify({ total: { calls: totalCalls, tokens: totalTokens, cost: totalCost }, byModel: limited }, null, 2));
          return;
        }

        const headers = ["Model", "Calls", "Tokens", "Cost"];
        const rows = limited.map((m) => [
          truncate(m.model, 40),
          String(m.calls),
          m.tokens.toLocaleString(),
          formatPriceStr(m.cost),
        ]);

        console.log(chalk.bold("\n  Spending by Model\n"));
        outputTable(headers, rows, format);
      }

      // Summary
      console.log("");
      console.log(chalk.dim(`  Total: ${totalCalls} calls, ${totalTokens.toLocaleString()} tokens, ${formatPriceStr(totalCost)}`));
      console.log("");
    });

  return cmd;
}
