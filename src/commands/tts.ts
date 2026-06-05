import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { requireOpenRouterKey } from "../lib/config";
import { apiFetch, formatNetworkError } from "../lib/fetch";
import type { GlobalOptions } from "../lib/types";
import { writeFileSync } from "fs";
import { resolve } from "path";

interface TTSModel {
  id: string;
  name: string;
  description?: string;
  pricing?: {
    prompt?: string;
    completion?: string;
    image?: string;
    request?: string;
  };
  supported_voices?: string[];
}

const TTS_MODELS_URL = "https://openrouter.ai/api/v1/models?output_modalities=speech";
const TTS_API_URL = "https://openrouter.ai/api/v1/audio/speech";

async function fetchTTSModels(apiKey: string): Promise<TTSModel[]> {
  const res = await apiFetch(TTS_MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch TTS models: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { data: TTSModel[] };
  return data.data;
}

function formatTTSPrice(model: TTSModel): string {
  const prompt = parseFloat(model.pricing?.prompt ?? "0");
  const request = parseFloat(model.pricing?.request ?? "0");
  if (prompt > 0) {
    return `$${(prompt * 1_000_000).toFixed(2)}/1M chars`;
  }
  if (request > 0) {
    return `$${request.toFixed(4)}/request`;
  }
  return "free";
}

function estimateTTSCost(model: TTSModel, text: string): number {
  const prompt = parseFloat(model.pricing?.prompt ?? "0");
  const request = parseFloat(model.pricing?.request ?? "0");
  return text.length * prompt + request;
}

export function ttsCommand(): Command {
  const cmd = new Command("tts")
    .description("Generate speech audio from text via OpenRouter TTS endpoint")
    .argument("[input...]", "Text to synthesize (or pass via --input)")
    .option("-m, --model <model>", "TTS model to use", "hexgrad/kokoro-82m")
    .option("-v, --voice <voice>", "Voice identifier", "alloy")
    .option("-o, --output <path>", "Output file path", "output.mp3")
    .option("-f, --format <format>", "Output format: mp3 or pcm", "mp3")
    .option("-s, --speed <n>", "Playback speed (0.5-2.0, OpenAI only)", parseFloat)
    .option("--input <text>", "Text to synthesize (alternative to positional arg)")
    .option("--list-models", "List available TTS models")
    .option("--list-voices", "List supported voices for the selected model")
    .option("--dry-run", "Show cost estimate without generating audio")
    .option("--json", "Output metadata as JSON (audio still saved to file)")
    .option("--quiet", "Suppress non-error output")
    .action(async (inputParts: string[], opts: GlobalOptions & {
      model?: string;
      voice?: string;
      output?: string;
      format?: string;
      speed?: number;
      input?: string;
      listModels?: boolean;
      listVoices?: boolean;
      dryRun?: boolean;
      json?: boolean;
      quiet?: boolean;
    }) => {
      const apiKey = requireOpenRouterKey();

      // ── List voices mode ──────────────────────────────────────────────
      if (opts.listVoices) {
        const spinner = ora(`Fetching voices for ${opts.model}...`).start();
        try {
          const models = await fetchTTSModels(apiKey);
          const model = models.find((m) => m.id === opts.model);
          if (!model) {
            spinner.fail(`Model not found: ${opts.model}`);
            if (!opts.quiet) {
              console.log(chalk.dim("Use `or tts --list-models` to see available TTS models."));
            }
            process.exit(1);
          }
          spinner.stop();

          const voices = model.supported_voices ?? [];

          if (opts.json) {
            console.log(JSON.stringify({ model: model.id, voices }, null, 2));
            return;
          }

          if (opts.quiet) return;

          console.log(chalk.bold(`\n  ${model.id}`));
          if (model.name) console.log(`  ${model.name}`);
          if (model.description) {
            console.log(`  ${chalk.dim(model.description.slice(0, 160))}${model.description.length > 160 ? "..." : ""}`);
          }
          console.log("");
          console.log(chalk.bold(`  Supported Voices (${voices.length}):`));
          for (const v of voices) {
            console.log(`    • ${v}`);
          }
          console.log("");
          return;
        } catch (err) {
          spinner.fail("Failed to fetch voices");
          if (!opts.quiet) console.error(chalk.red(formatNetworkError(err)));
          process.exit(1);
        }
      }

      // ── List models mode ──────────────────────────────────────────────
      if (opts.listModels) {
        const spinner = ora("Fetching TTS models...").start();
        try {
          const models = await fetchTTSModels(apiKey);
          spinner.stop();

          if (opts.json) {
            console.log(JSON.stringify(models, null, 2));
            return;
          }

          if (opts.quiet) return;

          console.log(chalk.bold("\n  Available TTS Models\n"));
          for (const m of models) {
            console.log(`  ${chalk.cyan(m.id)}  ${chalk.dim(formatTTSPrice(m))}`);
            if (m.name) console.log(`    ${m.name}`);
            if (m.description) console.log(`    ${chalk.dim(m.description.slice(0, 120))}${m.description.length > 120 ? "..." : ""}`);
            console.log("");
          }
          console.log(chalk.dim(`  ${models.length} model(s)`));
          console.log("");
          return;
        } catch (err) {
          spinner.fail("Failed to fetch TTS models");
          if (!opts.quiet) console.error(chalk.red(formatNetworkError(err)));
          process.exit(1);
        }
      }

      // ── Synthesis mode ────────────────────────────────────────────────
      const text = opts.input ?? inputParts.join(" ");
      if (!text || !text.trim()) {
        console.error(chalk.red("Error: No text provided. Pass text as argument or use --input <text>"));
        process.exit(1);
      }

      const modelId = opts.model!;
      const voice = opts.voice!;
      const format = opts.format ?? "mp3";
      const outputPath = resolve(opts.output ?? "output.mp3");

      // Fetch model info for validation + pricing
      let ttsModel: TTSModel | undefined;
      try {
        const models = await fetchTTSModels(apiKey);
        ttsModel = models.find((m) => m.id === modelId);
      } catch {
        // Continue without model info; API will validate
      }

      // Validate voice
      if (ttsModel?.supported_voices && ttsModel.supported_voices.length > 0) {
        if (!ttsModel.supported_voices.includes(voice)) {
          console.error(chalk.red(`Error: Invalid voice "${voice}" for model ${modelId}`));
          console.error(chalk.dim(`  Valid voices: ${ttsModel.supported_voices.join(", ")}`));
          console.error(chalk.dim(`  Run \`or tts --list-voices -m ${modelId}\` to see all voices.`));
          process.exit(1);
        }
      }

      // Show cost estimate
      const cost = ttsModel ? estimateTTSCost(ttsModel, text) : null;
      if (cost !== null && cost > 0 && !opts.quiet) {
        console.log(chalk.dim(`  Estimated cost: $${cost.toFixed(4)} (${text.length} chars)`));
      }

      if (opts.dryRun) {
        if (!opts.quiet) {
          console.log(chalk.blue("ℹ Dry run — no audio generated."));
        }
        return;
      }

      const body: Record<string, any> = {
        model: modelId,
        input: text,
        voice,
        response_format: format,
      };
      if (opts.speed !== undefined) {
        body.speed = opts.speed;
      }

      const spinnerText = `Synthesizing speech with ${modelId}...`;
      const spinner = opts.quiet ? null : ora(spinnerText).start();

      try {
        const res = await apiFetch(TTS_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/or-cli",
            "X-Title": "or-cli",
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          spinner?.fail(`Failed: ${res.status}`);

          // Helpful guidance on voice errors
          if (res.status === 400 && errBody.toLowerCase().includes("voice")) {
            console.error(chalk.red("Error: Invalid voice parameter."));
            console.error(chalk.dim(`  Run \`or tts --list-voices -m ${modelId}\` to see valid voices.`));
          } else {
            try {
              const parsed = JSON.parse(errBody);
              console.error(chalk.red(JSON.stringify(parsed, null, 2)));
            } catch {
              console.error(chalk.red(errBody));
            }
          }
          process.exit(1);
        }

        const audioBuffer = await res.arrayBuffer();
        const generationId = res.headers.get("X-Generation-Id");
        spinner?.stop();

        writeFileSync(outputPath, new Uint8Array(audioBuffer));

        const sizeKb = audioBuffer.byteLength / 1024;

        if (opts.json) {
          console.log(JSON.stringify({
            model: modelId,
            voice,
            input: text,
            format,
            output: outputPath,
            size_bytes: audioBuffer.byteLength,
            size_kb: Math.round(sizeKb * 10) / 10,
            generation_id: generationId,
            estimated_cost: cost,
          }, null, 2));
          return;
        }

        if (opts.quiet) return;

        console.log("");
        console.log(chalk.green(`✓ Audio saved to ${outputPath} (${sizeKb.toFixed(1)}KB)`));
        if (generationId) {
          console.log(chalk.dim(`  Generation ID: ${generationId}`));
        }
        console.log(chalk.dim(`  Model: ${modelId} • Voice: ${voice} • Format: ${format}`));
        if (cost !== null && cost > 0) {
          console.log(chalk.dim(`  Cost: $${cost.toFixed(4)}`));
        }
        console.log("");
      } catch (err) {
        spinner?.fail("Failed to synthesize speech");
        if (!opts.quiet) console.error(chalk.red(formatNetworkError(err)));
        process.exit(1);
      }
    });

  return cmd;
}
