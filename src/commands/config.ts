import { Command } from "commander";
import chalk from "chalk";
import { getConfig, setConfig, type Config, type DefaultModels } from "../lib/config";

function printConfig(config: Config): void {
  console.log(chalk.bold("\n  or-cli config\n"));

  // API Keys (masked)
  console.log(chalk.bold("  API Keys"));
  console.log(`    OpenRouter:  ${config.openrouterApiKey ? config.openrouterApiKey.slice(0, 12) + "..." : chalk.dim("not set")}`);
  console.log(`    AA:          ${config.artificialAnalysisApiKey ? config.artificialAnalysisApiKey.slice(0, 12) + "..." : chalk.dim("not set")}`);
  console.log("");

  // Default models
  console.log(chalk.bold("  Default Models"));
  const global = config.defaultModel ?? chalk.dim("not set");
  console.log(`    Global:      ${global}`);
  const defaults = config.defaultModels ?? {};
  const modalities = ["text", "image", "vision", "audio", "video"] as const;
  for (const mod of modalities) {
    const val = defaults[mod] ?? chalk.dim("—");
    console.log(`    ${mod.padEnd(12)} ${val}`);
  }
  console.log("");

  // Cache
  console.log(chalk.bold("  Cache"));
  console.log(`    TTL:         ${config.cacheTtlMs ? (config.cacheTtlMs / 3600000).toFixed(1) + "h" : "6h"}`);
  console.log("");
}

export function configCommand(): Command {
  const cmd = new Command("config")
    .description("View or update CLI configuration")
    .option("--show", "Show current config (default)")
    .option("--set-default <model>", "Set global default model")
    .option("--set-text <model>", "Set default model for text prompts")
    .option("--set-image <model>", "Set default model for image generation")
    .option("--set-vision <model>", "Set default model when --image is used")
    .option("--set-audio <model>", "Set default model when --audio is used")
    .option("--set-video <model>", "Set default model when --video is used")
    .option("--clear <modality>", "Clear default for a modality (text/image/vision/audio/video/global)")
    .action((opts) => {
      const config = getConfig();
      let updated = false;
      const changes: Partial<Config> = {};
      const modelDefaults: DefaultModels = { ...(config.defaultModels ?? {}) };

      // Set global default
      if (opts.setDefault) {
        changes.defaultModel = opts.setDefault;
        console.log(chalk.green(`✓ Global default set to ${opts.setDefault}`));
        updated = true;
      }

      // Set per-modality defaults
      const modalityMap: Record<string, keyof DefaultModels> = {
        setText: "text",
        setImage: "image",
        setVision: "vision",
        setAudio: "audio",
        setVideo: "video",
      };

      for (const [opt, mod] of Object.entries(modalityMap)) {
        if (opts[opt]) {
          modelDefaults[mod] = opts[opt];
          console.log(chalk.green(`✓ ${mod} default set to ${opts[opt]}`));
          updated = true;
        }
      }

      // Apply all model defaults at once
      if (updated) {
        changes.defaultModels = modelDefaults;
        setConfig(changes);
      }

      // Clear defaults
      if (opts.clear) {
        const modality = opts.clear.toLowerCase();
        if (modality === "global") {
          setConfig({ defaultModel: undefined });
          console.log(chalk.green("✓ Global default cleared"));
          updated = true;
        } else if (["text", "image", "vision", "audio", "video"].includes(modality)) {
          const current = { ...(config.defaultModels ?? {}) };
          delete current[modality as keyof DefaultModels];
          setConfig({ defaultModels: current });
          console.log(chalk.green(`✓ ${modality} default cleared`));
          updated = true;
        } else {
          console.log(chalk.red(`Unknown modality: ${modality}. Use: text, image, vision, audio, video, global`));
        }
      }

      // Show config (always, unless we just set something)
      if (!updated || opts.show) {
        const fresh = getConfig();
        printConfig(fresh);
      }
    });

  return cmd;
}
