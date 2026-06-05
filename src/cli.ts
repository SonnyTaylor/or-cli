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
import { creditsCommand } from "./commands/credits";
import { rankingsCommand } from "./commands/rankings";
import { versionCommand } from "./commands/version";
import { doctorCommand } from "./commands/doctor";
import { costCommand } from "./commands/cost";
import { configCommand } from "./commands/config";
import { conversationsCommand } from "./commands/conversations";
import { ttsCommand } from "./commands/tts";

const program = new Command();

program
  .name("or")
  .description("CLI for OpenRouter — search models, send messages, view benchmarks")
  .version("0.3.0");

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
program.addCommand(creditsCommand());
program.addCommand(rankingsCommand());
program.addCommand(versionCommand());
program.addCommand(doctorCommand());
program.addCommand(costCommand());
program.addCommand(configCommand());
program.addCommand(conversationsCommand());
program.addCommand(ttsCommand());

program.parse();
