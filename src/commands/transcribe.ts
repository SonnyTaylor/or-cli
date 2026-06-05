import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve, extname, dirname } from "path";
import { requireOpenRouterKey } from "../lib/config";
import { getFormat, error, formatDollars } from "../lib/format";
import { apiFetch, formatNetworkError } from "../lib/fetch";
import { readStdin } from "../lib/chat-core";
import type { GlobalOptions, TranscriptionRequest, TranscriptionResponse } from "../lib/types";

const TRANSCRIPTION_API = "https://openrouter.ai/api/v1/audio/transcriptions";

export function transcribeCommand(): Command {
  const cmd = new Command("transcribe")
    .description("Transcribe audio to text (speech-to-text)")
    .argument("[file]", "Audio file to transcribe (wav, mp3, flac, m4a, ogg, webm)")
    .option("-m, --model <model>", "STT model", "openai/whisper-large-v3-turbo")
    .option("-l, --language <code>", "Language code (e.g. en, ja, fr) — auto-detected if omitted")
    .option("--temperature <n>", "Sampling temperature (0-1)", parseFloat)
    .option("--output <path>", "Save transcription to file")
    .option("--json", "Output as JSON")
    .option("--quiet", "Output only the transcribed text")
    .action(async (fileArg: string, opts: any) => {
      const apiKey = requireOpenRouterKey();
      const format = getFormat(opts);

      // ── Resolve input file ──────────────────────────────────────────
      let filePath = fileArg;
      if (!filePath) {
        error("Error: No audio file provided.");
        console.error(chalk.dim("  Usage: or transcribe <file> [options]"));
        process.exit(2);
      }

      const absPath = resolve(filePath);
      if (!existsSync(absPath)) {
        error(`File not found: ${filePath}`);
        process.exit(2);
      }

      // Validate extension
      const ext = extname(absPath).toLowerCase().slice(1);
      const supportedFormats = ["wav", "mp3", "flac", "m4a", "ogg", "webm", "aac", "mp4"];
      if (!supportedFormats.includes(ext)) {
        error(`Unsupported format: .${ext}`);
        console.error(chalk.dim(`  Supported: ${supportedFormats.join(", ")}`));
        process.exit(2);
      }

      // Read and encode
      const audioData = readFileSync(absPath).toString("base64");

      // ── Build request ───────────────────────────────────────────────
      const body: TranscriptionRequest = {
        input_audio: {
          data: audioData,
          format: ext,
        },
        model: opts.model,
      };

      if (opts.language) body.language = opts.language;
      if (opts.temperature !== undefined) body.temperature = opts.temperature;

      const fileSizeMb = (Buffer.byteLength(audioData, "base64") / (1024 * 1024)).toFixed(1);
      const spinner = opts.quiet ? null : ora(`Transcribing ${filePath} (${fileSizeMb}MB) with ${opts.model}...`).start();
      const startTime = Date.now();

      try {
        const res = await apiFetch(TRANSCRIPTION_API, {
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
          try {
            const parsed = JSON.parse(errBody);
            console.error(chalk.red(JSON.stringify(parsed, null, 2)));
          } catch {
            console.error(chalk.red(errBody));
          }
          process.exit(1);
        }

        const result = (await res.json()) as TranscriptionResponse;
        const latencyMs = Date.now() - startTime;
        spinner?.stop();

        // Save to file if --output
        if (opts.output) {
          const outPath = resolve(opts.output);
          const dirPath = dirname(outPath);
          if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });
          writeFileSync(outPath, result.text, "utf-8");
          if (!opts.quiet) {
            console.log(chalk.green(`✓ Saved to ${outPath}`));
          }
        }

        // Output
        if (format === "json") {
          console.log(JSON.stringify({ ...result, latency_ms: latencyMs }, null, 2));
          return;
        }

        if (opts.quiet) {
          process.stdout.write(result.text);
          if (process.stdout.isTTY) process.stdout.write("\n");
          return;
        }

        // Pretty print
        console.log("");
        console.log(chalk.bold("  Transcription"));
        console.log(chalk.dim(`  Model: ${opts.model}`));
        if (opts.language) console.log(chalk.dim(`  Language: ${opts.language}`));
        console.log("");
        console.log(`  ${result.text}`);
        console.log("");

        const usageParts: string[] = [];
        if (result.usage?.seconds) usageParts.push(`${result.usage.seconds.toFixed(1)}s audio`);
        if (result.usage?.total_tokens) usageParts.push(`${result.usage.total_tokens} tokens`);
        if (result.usage?.cost) usageParts.push(formatDollars(result.usage.cost));
        usageParts.push(`${latencyMs}ms`);
        console.log(chalk.dim(`  ${usageParts.join(" • ")}`));
        console.log("");
      } catch (err) {
        spinner?.fail("Transcription failed");
        error(formatNetworkError(err));
        process.exit(1);
      }
    });

  return cmd;
}
