import { Command } from "commander";
import { authCommand } from "./commands/auth";
import { chatCommand } from "./commands/chat";
import { modelsCommand } from "./commands/models";
import { showCommand } from "./commands/show";
import { compareCommand } from "./commands/compare";
import { benchmarksCommand } from "./commands/benchmarks";
import { cacheCommand } from "./commands/cache";
import { historyCommand } from "./commands/history";
import { endpointsCommand } from "./commands/endpoints";
import { providersCommand } from "./commands/providers";

const program = new Command();

program
  .name("or")
  .description("CLI for OpenRouter — search models, send messages, view benchmarks")
  .version("0.1.0");

program.addCommand(authCommand());
program.addCommand(chatCommand());
program.addCommand(modelsCommand());
program.addCommand(showCommand());
program.addCommand(compareCommand());
program.addCommand(benchmarksCommand());
program.addCommand(cacheCommand());
program.addCommand(historyCommand());
program.addCommand(endpointsCommand());
program.addCommand(providersCommand());

program.parse();
