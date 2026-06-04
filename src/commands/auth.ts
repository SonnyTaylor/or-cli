import { Command } from "commander";
import chalk from "chalk";
import { getConfig, setConfig } from "../lib/config";
import { success, error } from "../lib/format";

export function authCommand(): Command {
  const cmd = new Command("auth")
    .description("Manage API keys")
    .option("--or-key <key>", "Set OpenRouter API key directly")
    .option("--aa-key <key>", "Set Artificial Analysis API key directly")
    .option("--show", "Show currently configured keys (masked)")
    .option("--remove <provider>", "Remove a key (openrouter | artificial-analysis)")
    .action(async (opts) => {
      // --show: display masked keys
      if (opts.show) {
        const config = getConfig();
        console.log(chalk.bold("Configured API keys:\n"));
        printKey("OpenRouter", config.openrouterApiKey);
        printKey("Artificial Analysis", config.artificialAnalysisApiKey);
        if (config.defaultModel) {
          console.log(`  Default model: ${chalk.cyan(config.defaultModel)}`);
        }
        return;
      }

      // --remove
      if (opts.remove) {
        if (opts.remove === "openrouter") {
          setConfig({ openrouterApiKey: undefined });
          success("OpenRouter API key removed");
        } else if (opts.remove === "artificial-analysis") {
          setConfig({ artificialAnalysisApiKey: undefined });
          success("Artificial Analysis API key removed");
        } else {
          error(`Unknown provider: ${opts.remove}. Use "openrouter" or "artificial-analysis"`);
        }
        return;
      }

      // --or-key / --aa-key direct set
      if (opts.orKey || opts.aaKey) {
        const update: Record<string, string> = {};
        if (opts.orKey) update.openrouterApiKey = opts.orKey;
        if (opts.aaKey) update.artificialAnalysisApiKey = opts.aaKey;
        setConfig(update);
        if (opts.orKey) success("OpenRouter API key saved");
        if (opts.aaKey) success("Artificial Analysis API key saved");
        return;
      }

      // Interactive mode — prompt for keys
      if (process.stdin.isTTY) {
        const { createInterface } = await import("readline");
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const question = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

        console.log(chalk.bold("or-cli authentication\n"));

        const config = getConfig();

        console.log(chalk.dim("OpenRouter API key — get one at https://openrouter.ai/keys"));
        if (config.openrouterApiKey) {
          console.log(chalk.dim(`  Currently set: ${mask(config.openrouterApiKey)}`));
        }
        const orKey = await question("  Enter key (or press Enter to skip): ");
        rl.close();

        const update: Record<string, string | undefined> = {};
        if (orKey.trim()) update.openrouterApiKey = orKey.trim();

        if (Object.keys(update).length > 0) {
          setConfig(update);
          success("API key(s) saved to ~/.or-cli/config.json");
        } else {
          console.log(chalk.dim("No changes made."));
        }
      } else {
        error("Non-interactive mode. Use --or-key <key> or --aa-key <key>");
        process.exit(1);
      }
    });

  return cmd;
}

function mask(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "..." + key.slice(-4);
}

function printKey(label: string, key: string | undefined): void {
  if (key) {
    console.log(`  ${label}: ${chalk.green(mask(key))}`);
  } else {
    console.log(`  ${label}: ${chalk.dim("not set")}`);
  }
}
