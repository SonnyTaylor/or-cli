import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { requireOpenRouterKey } from "../lib/config";
import { apiFetch, formatNetworkError } from "../lib/fetch";
import type { GlobalOptions } from "../lib/types";

interface CreditsData {
  total_credits: number;
  total_usage: number;
}

export function creditsCommand(): Command {
  const cmd = new Command("credits")
    .description("Show your OpenRouter account credits and usage")
    .option("--json", "Output as JSON")
    .action(async (opts: GlobalOptions) => {
      const apiKey = requireOpenRouterKey();

      const spinner = ora("Fetching credits...").start();

      try {
        const res = await apiFetch("https://openrouter.ai/api/v1/credits", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          spinner.fail(`Failed: ${res.status}`);
          console.error(body);
          process.exit(1);
        }

        const data = (await res.json()) as { data: CreditsData };
        spinner.stop();

        const credits = data.data;
        const remaining = credits.total_credits - credits.total_usage;
        const percentUsed = (credits.total_usage / credits.total_credits) * 100;

        if (opts.json) {
          console.log(JSON.stringify({
            total_credits: credits.total_credits,
            total_usage: credits.total_usage,
            remaining,
            percent_used: percentUsed,
          }, null, 2));
          return;
        }

        console.log("");
        console.log(chalk.bold("OpenRouter Credits\n"));

        // Progress bar
        const barWidth = 30;
        const filled = Math.round((remaining / credits.total_credits) * barWidth);
        const empty = barWidth - filled;
        const barColor = remaining < 1 ? chalk.red : remaining < 5 ? chalk.yellow : chalk.green;
        const bar = barColor("█".repeat(filled)) + chalk.dim("░".repeat(empty));

        console.log(`  Balance:   [${bar}] $${remaining.toFixed(2)}`);
        console.log("");
        console.log(`  Total:     $${credits.total_credits.toFixed(2)}`);
        console.log(`  Used:      $${credits.total_usage.toFixed(2)} (${percentUsed.toFixed(1)}%)`);
        console.log(`  Remaining: $${remaining.toFixed(2)}`);
        console.log("");
      } catch (err) {
        spinner.fail("Failed to fetch credits");
        console.error(chalk.red(formatNetworkError(err)));
        process.exit(1);
      }
    });

  return cmd;
}
