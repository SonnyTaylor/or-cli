import { Command } from "commander";
import chalk from "chalk";
import { authCommand } from "./commands/auth";
import { askCommand } from "./commands/ask";
import { chatCommand } from "./commands/chat";
import { createCommand } from "./commands/create";
import { modelsCommand } from "./commands/models";
import { showCommand } from "./commands/show";
import { compareCommand } from "./commands/compare";
import { benchmarksCommand } from "./commands/benchmarks";
import { cacheCommand } from "./commands/cache";
import { historyCommand } from "./commands/history";
import { endpointsCommand } from "./commands/endpoints";
import { providersCommand } from "./commands/providers";
import { creditsCommand } from "./commands/credits";
import { rankingsCommand } from "./commands/rankings";
import { versionCommand } from "./commands/version";
import { doctorCommand } from "./commands/doctor";
import { costCommand } from "./commands/cost";
import { configCommand } from "./commands/config";
import { conversationsCommand } from "./commands/conversations";
import { embedCommand } from "./commands/embed";
import { transcribeCommand } from "./commands/transcribe";
import { rerankCommand } from "./commands/rerank";

const program = new Command();

program
  .name("or")
  .description("CLI for OpenRouter — ask models, generate media, discover the best model for the job")
  .version("0.6.0")
  .showSuggestionAfterError(true)
  .configureHelp({ sortSubcommands: false });

// Registration order = help order. Grouped by intent: converse → create →
// process → discover → account/system.

// Converse
program.addCommand(askCommand());
program.addCommand(chatCommand());

// Create media
program.addCommand(createCommand());

// Process
program.addCommand(embedCommand());
program.addCommand(transcribeCommand());
program.addCommand(rerankCommand());

// Discover
program.addCommand(modelsCommand());
program.addCommand(showCommand());
program.addCommand(compareCommand());
program.addCommand(benchmarksCommand());
program.addCommand(rankingsCommand());
program.addCommand(providersCommand());
program.addCommand(endpointsCommand());

// Account & system
program.addCommand(authCommand());
program.addCommand(configCommand());
program.addCommand(creditsCommand());
program.addCommand(costCommand());
program.addCommand(historyCommand());
program.addCommand(conversationsCommand());
program.addCommand(cacheCommand());
program.addCommand(doctorCommand());
program.addCommand(versionCommand());

program.addHelpText(
  "after",
  `
${chalk.bold("Common workflows:")}
  ${chalk.dim("# Ask a question (one-shot)")}
  or ask "Explain monads" -m deepseek/deepseek-v4-flash

  ${chalk.dim("# Find the right model — sorted by live popularity, with benchmark scores")}
  or models -n 20
  or models "coding" --tools --sort intelligence

  ${chalk.dim("# See top benchmarked models with their OpenRouter IDs")}
  or benchmarks -n 10
  or benchmarks --type text-to-image -n 10

  ${chalk.dim("# Generate or edit an image")}
  or create image "A mountain logo" --save logo.png
  or create image "Make the sky purple" --image photo.jpg --save edited.png

  ${chalk.dim("# Analyze files")}
  or ask "Describe this" --image photo.jpg
  or ask "Summarize" --pdf report.pdf

  ${chalk.dim("# Every command supports --json (machine-readable) and --quiet (pipeable)")}
  or models -t image --json | jq -r '.[].id'

${chalk.dim("Run `or <command> --help` for details on any command.")}`
);

program.parse();
