import { Command } from "commander";
import chalk from "chalk";
import {
  listConversations,
  loadConversation,
  deleteConversation,
  generateConvId,
} from "../lib/conversations";
import { getFormat, outputTable, truncate, formatPriceStr } from "../lib/format";
import type { GlobalOptions } from "../lib/types";

export function conversationsCommand(): Command {
  const cmd = new Command("conversations")
    .description("List, view, and manage conversations");

  // or conversations — list recent
  cmd
    .command("list")
    .description("Show recent conversations")
    .option("-n, --limit <n>", "Max results", parseInt, 20)
    .option("--json", "Output as JSON")
    .option("--md", "Output as Markdown table")
    .option("--quiet", "Suppress non-error output")
    .action((opts: GlobalOptions & { limit?: number }) => {
      const convs = listConversations(opts.limit);
      const format = getFormat(opts);

      if (convs.length === 0) {
        console.log(chalk.dim("No conversations yet. Use `or chat --conversation` to start one."));
        return;
      }

      if (format === "json") {
        console.log(JSON.stringify(convs, null, 2));
        return;
      }

      const headers = ["ID", "Model", "Messages", "Started", "Last", "Title"];
      const rows = convs.map((c) => [
        c.id,
        truncate(c.model, 30),
        String(c.messageCount),
        formatTimeAgo(c.createdAt),
        formatTimeAgo(c.updatedAt),
        truncate(c.title ?? "", 45),
      ]);

      outputTable(headers, rows, format);

      if (format === "table") {
        console.log(chalk.dim(`\n  ${convs.length} conversations`));
        console.log(chalk.dim("  Use `or conversations show <id>` to view full thread"));
        console.log(chalk.dim("  Use `or chat --resume <id>` to continue a conversation"));
      }
    });

  // or history show <id>
  cmd
    .command("show")
    .description("Show full conversation thread")
    .argument("<id>", "Conversation ID")
    .option("--json", "Output as JSON")
    .action((id: string, opts: { json?: boolean }) => {
      const entries = loadConversation(id);

      if (entries.length === 0) {
        console.error(chalk.red(`No conversation found with ID: ${id}`));
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify({ id, entries }, null, 2));
        return;
      }

      console.log("");
      console.log(chalk.bold.underline(`Conversation: ${id}`));
      console.log(chalk.dim(`  Started: ${entries[0]!.timestamp}`));
      console.log("");

      // Track session totals
      let totalIn = 0;
      let totalOut = 0;
      let totalTokens = 0;
      let totalCost = 0;
      let totalLatency = 0;
      let turnCount = 0;
      let cachedTokens = 0;

      for (const entry of entries) {
        if (entry.role === "system") {
          console.log(chalk.bold.blue("System:"));
          console.log(chalk.dim(`  ${entry.content}`));
          console.log("");
        } else if (entry.role === "user") {
          const text = typeof entry.content === "string" ? entry.content : JSON.stringify(entry.content);
          console.log(chalk.bold.green("You:"));
          console.log(`  ${text}`);
          console.log("");
        } else if (entry.role === "assistant") {
          const text = typeof entry.content === "string" ? entry.content : JSON.stringify(entry.content);
          console.log(chalk.bold.magenta(`Assistant (${entry.model ?? "?"}):`));
          console.log(`  ${text}`);
          if (entry.usage) {
            totalIn += entry.usage.promptTokens;
            totalOut += entry.usage.completionTokens;
            totalTokens += entry.usage.totalTokens;
          }
          if (entry.costEstimate) totalCost += entry.costEstimate;
          if (entry.latencyMs) totalLatency += entry.latencyMs;
          turnCount++;
          console.log(chalk.dim(`    ${entry.usage?.totalTokens ?? "?"} tokens • ${entry.latencyMs ? (entry.latencyMs / 1000).toFixed(1) + "s" : "?"} • ${entry.costEstimate ? "$" + entry.costEstimate.toFixed(4) : "?"}`));
          console.log("");
        }
      }

      // Session summary
      if (turnCount > 0) {
        console.log(chalk.bold("── Session Totals ──"));
        console.log(`  Turns:      ${turnCount}`);
        console.log(`  Tokens:     ${totalTokens.toLocaleString()} (${totalIn.toLocaleString()} in / ${totalOut.toLocaleString()} out)`);
        console.log(`  Cost:       ${totalCost > 0 ? "$" + totalCost.toFixed(4) : "$0.0000"}`);
        console.log(`  Latency:    ${(totalLatency / 1000).toFixed(1)}s total • ${(totalLatency / turnCount / 1000).toFixed(1)}s avg`);
        console.log("");
      }
    });

  // or conversations delete <id>
  cmd
    .command("delete")
    .description("Delete a conversation")
    .argument("<id>", "Conversation ID")
    .option("--confirm", "Skip confirmation prompt")
    .action(async (id: string, opts: { confirm?: boolean }) => {
      if (!opts.confirm && process.stdin.isTTY) {
        const { createInterface } = await import("readline");
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>((resolve) =>
          rl.question(chalk.yellow(`Delete conversation ${id}? [y/N] `), resolve)
        );
        rl.close();
        if (answer.toLowerCase() !== "y") {
          console.log(chalk.dim("Cancelled."));
          return;
        }
      }

      if (deleteConversation(id)) {
        console.log(chalk.green("✓") + ` Deleted conversation ${id}`);
      } else {
        console.error(chalk.red(`Conversation ${id} not found`));
        process.exit(1);
      }
    });

  return cmd;
}

function formatTimeAgo(iso: string): string {
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
