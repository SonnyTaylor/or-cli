import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { resolve, dirname, extname } from "path";
import { requireOpenRouterKey, getDefaultModel } from "../lib/config";
import { getFormat, error, formatDollars } from "../lib/format";
import { formatNetworkError } from "../lib/fetch";
import { apiFetch } from "../lib/fetch";
import { fetchModels, isImageGenModel, isImageEditModel, isVideoModel, isSpeechModel, imageGeneration } from "../lib/openrouter";
import { buildMessages, buildRequest, buildExtraHeaders, handleNonStream, getMimeType, IMAGE_EXTS, readStdin } from "../lib/chat-core";
import type { ChatMessage, ImagesRequest } from "../lib/types";

// ── Image Generation ─────────────────────────────────────────────────────────

// OpenAI's gpt-image-* family is only served on the dedicated /api/v1/images
// endpoint and hard-404s on /chat/completions. Route it there directly.
function usesImagesEndpoint(model: string): boolean {
  return /^openai\/gpt-image/i.test(model);
}

// OpenRouter's 404 for an images-endpoint-only model is specific and stable:
// "...cannot be used with the chat/completions endpoint. Use the /api/v1/images
// endpoint instead." Use it as a fallback trigger so unknown models self-heal.
function isImagesEndpointError(err: unknown): boolean {
  return err instanceof Error && /\/api\/v1\/images|images endpoint/i.test(err.message);
}

// Read input image files (for image-to-image / editing) into data URLs.
function readInputImages(paths: string[]): string[] {
  return paths.map((p) => {
    const imgPath = resolve(p);
    if (!existsSync(imgPath)) {
      error(`Input image not found: ${p}`);
      process.exit(2);
    }
    const b64 = readFileSync(imgPath).toString("base64");
    const mime = getMimeType(imgPath, IMAGE_EXTS, "image/jpeg");
    return `data:${mime};base64,${b64}`;
  });
}

function buildImagesBody(
  model: string,
  prompt: string,
  opts: any,
  inputImages: string[]
): ImagesRequest {
  const body: ImagesRequest = { model, prompt };
  if (inputImages.length > 0) {
    body.input_references = inputImages.map((url) => ({
      type: "image_url" as const,
      image_url: { url },
    }));
  }
  if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;
  if (opts.imageSize) body.size = opts.imageSize;
  const ext = extname(opts.save).slice(1).toLowerCase();
  const fmt = ext === "jpg" ? "jpeg" : ext;
  if (fmt === "png" || fmt === "jpeg" || fmt === "webp" || fmt === "svg") {
    body.output_format = fmt;
  }
  return body;
}

async function generateViaImagesEndpoint(
  apiKey: string,
  model: string,
  prompt: string,
  opts: any,
  inputImages: string[]
): Promise<{ b64: string; mime: string }> {
  const resp = await imageGeneration(apiKey, buildImagesBody(model, prompt, opts, inputImages));
  const first = resp.data?.[0];
  const b64 = first?.b64_json ?? "";
  if (!b64) throw new Error("No image returned from /api/v1/images endpoint");
  return { b64, mime: first?.media_type ?? "image/png" };
}

// Write decoded image bytes to disk and print the result. Shared by both the
// chat/completions image path and the dedicated /images endpoint path.
function saveImageBytes(
  b64: string,
  mime: string,
  opts: any,
  model: string,
  prompt: string,
  latencyMs: number,
  format: string
): void {
  const isSvg = mime === "image/svg+xml";
  const imgBuf = Buffer.from(b64, "base64");
  let outPath = resolve(opts.save);

  if (isSvg && !outPath.endsWith(".svg")) {
    outPath = outPath.replace(/\.(png|jpg|jpeg|webp|gif)$/i, ".svg");
    if (!opts.quiet) {
      console.log(chalk.yellow(`⚠ SVG output — saving as ${extname(outPath)}`));
    }
  }

  const dir = dirname(outPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(outPath, imgBuf);

  const sizeKb = imgBuf.length / 1024;

  if (format === "json") {
    console.log(JSON.stringify({
      model,
      prompt,
      output: outPath,
      size_bytes: imgBuf.length,
      size_kb: Math.round(sizeKb * 10) / 10,
      latency_ms: latencyMs,
    }, null, 2));
  } else if (!opts.quiet) {
    console.log(chalk.green(`✓ Saved to ${outPath} (${sizeKb.toFixed(0)}KB)`));
    console.log(chalk.dim(`  Model: ${model} • ${latencyMs}ms`));
  }
}

export function createImageCommand(): Command {
  const cmd = new Command("image")
    .description("Generate an image from a text prompt (add --image for editing / image-to-image)")
    .argument("[prompt...]", "Text prompt describing the image")
    .option("-m, --model <model>", "Image generation model")
    .option("--image <paths...>", "Input image(s) — edit, restyle, or combine them (image-to-image)")
    .option("--save <path>", "Output file path", "output.png")
    .option("--aspect-ratio <ratio>", "Aspect ratio (e.g. 16:9, 1:1)")
    .option("--image-size <size>", "Image size (e.g. 1024x1024)")
    .option("--style <style>", "Image style")
    .option("--json", "Output metadata as JSON")
    .option("--quiet", "Suppress non-error output")
    .action(async (promptParts: string[], opts: any) => {
      const apiKey = requireOpenRouterKey();
      const format = getFormat(opts);

      let prompt = promptParts.join(" ");
      if (!prompt || !prompt.trim()) {
        if (!process.stdin.isTTY) {
          prompt = await readStdin();
        }
        if (!prompt || !prompt.trim()) {
          error("Error: No prompt provided.");
          process.exit(2);
        }
      }

      // Input images for editing / image-to-image (validated up front)
      const inputPaths: string[] = opts.image
        ? Array.isArray(opts.image) ? opts.image : [opts.image]
        : [];
      const inputImages = readInputImages(inputPaths);

      // Determine model
      let model = opts.model || getDefaultModel("image");
      if (!model) {
        // Auto-detect an image model; when editing, require image input support
        const spinner = opts.quiet ? null : ora("Finding an image generation model...").start();
        try {
          const models = await fetchModels(apiKey);
          const usable = models.filter(
            (m) => !m.id.startsWith("~") && m.id !== "openrouter/auto" &&
              (inputImages.length > 0 ? isImageEditModel(m) : isImageGenModel(m))
          );
          if (usable.length === 0) {
            spinner?.fail("No suitable image generation models found.");
            process.exit(1);
          }
          model = usable[0]!.id;
          spinner?.stop();
          if (!opts.quiet) {
            console.log(chalk.dim(`  No model specified — using ${model}. Set a default with \`or config --set-image <id>\`.`));
          }
        } catch (err) {
          spinner?.fail("Failed to fetch models");
          error(formatNetworkError(err));
          process.exit(1);
        }
      }

      // Attach input images as content parts (chat/completions image editing)
      const messages: ChatMessage[] = [
        {
          role: "user",
          content: inputImages.length > 0
            ? [
                ...inputImages.map((url) => ({ type: "image_url" as const, image_url: { url } })),
                { type: "text" as const, text: prompt },
              ]
            : prompt,
        },
      ];

      const request = buildRequest(
        {
          model,
          modalities: ["image"],
        },
        messages
      );

      // Add image config if provided
      if (opts.aspectRatio || opts.imageSize || opts.style) {
        request.image_config = {};
        if (opts.aspectRatio) request.image_config.aspect_ratio = opts.aspectRatio;
        if (opts.imageSize) request.image_config.image_size = opts.imageSize;
        if (opts.style) request.image_config.style = opts.style;
      }

      const spinner = opts.quiet ? null : ora(`Generating image with ${model}...`).start();
      const startTime = Date.now();

      try {
        let saved: { b64: string; mime: string } | null = null;
        let httpUrl: string | null = null;
        let textFallback: string | null = null;

        if (usesImagesEndpoint(model)) {
          // Known images-endpoint-only model — skip the wasted chat/completions 404.
          saved = await generateViaImagesEndpoint(apiKey, model, prompt, opts, inputImages);
        } else {
          try {
            const result = await handleNonStream(apiKey, request, {});
            const respMessage = result.response.choices?.[0]?.message;
            const respImages = (respMessage as any)?.images ?? [];

            if (respImages.length > 0) {
              const url = respImages[0]?.image_url?.url ?? respImages[0]?.url ?? "";
              if (url.startsWith("data:")) {
                const b64 = url.split(",")[1] ?? "";
                const mime = url.match(/^data:([^;]+);base64,/)?.[1] ?? "image/png";
                saved = { b64, mime };
              } else if (url.startsWith("http")) {
                httpUrl = url;
              }
            } else {
              textFallback = respMessage?.content ?? "";
            }
          } catch (err) {
            // Model is images-endpoint-only but wasn't matched upfront — retry there.
            if (isImagesEndpointError(err)) {
              saved = await generateViaImagesEndpoint(apiKey, model, prompt, opts, inputImages);
            } else {
              throw err;
            }
          }
        }

        const latencyMs = Date.now() - startTime;
        spinner?.stop();

        if (saved) {
          saveImageBytes(saved.b64, saved.mime, opts, model, prompt, latencyMs, format);
        } else if (httpUrl) {
          if (format === "json") {
            console.log(JSON.stringify({ model, prompt, url: httpUrl, latency_ms: latencyMs }, null, 2));
          } else if (!opts.quiet) {
            console.log(chalk.yellow(`Image URL: ${httpUrl}`));
          }
        } else {
          // No image returned — model may have replied with text instead.
          const hint = "The model may not support image output. Find image models with `or models -t image` (add --image support check via `or show <id>`).";
          if (format === "json") {
            console.log(JSON.stringify({
              error: "no_image_in_response",
              model,
              text: textFallback || undefined,
              hint,
            }, null, 2));
          } else if (!opts.quiet) {
            if (textFallback) {
              console.log(chalk.yellow("No image in response. Model returned text:"));
              console.log(textFallback);
            } else {
              console.log(chalk.yellow("No image in response."));
            }
            console.log(chalk.dim(`  ${hint}`));
          }
          process.exit(1);
        }
      } catch (err) {
        spinner?.fail("Image generation failed");
        error(formatNetworkError(err));
        process.exit(1);
      }
    });

  return cmd;
}

// ── Video Generation ─────────────────────────────────────────────────────────

const VIDEOS_API = "https://openrouter.ai/api/v1/videos";
const VIDEOS_MODELS_API = "https://openrouter.ai/api/v1/videos/models";

interface VideoModel {
  id: string;
  name: string;
  description?: string;
  supported_resolutions?: string[];
  supported_aspect_ratios?: string[];
  supported_sizes?: string[];
  pricing_skus?: Record<string, string>;
  allowed_passthrough_parameters?: string[];
}

interface VideoJobSubmit {
  id: string;
  polling_url: string;
  status: string;
}

interface VideoJobStatus {
  id: string;
  generation_id?: string;
  polling_url: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "expired";
  unsigned_urls?: string[];
  usage?: { cost: number; is_byok: boolean };
  error?: string;
}

async function fetchVideoModels(apiKey: string): Promise<VideoModel[]> {
  const res = await apiFetch(VIDEOS_MODELS_API, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch video models: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { data: VideoModel[] };
  return data.data;
}

async function submitVideoJob(apiKey: string, body: Record<string, any>): Promise<VideoJobSubmit> {
  const res = await apiFetch(VIDEOS_API, {
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
    const bodyText = await res.text().catch(() => "");
    throw new Error(`Video generation failed: ${res.status} ${bodyText}`);
  }
  return res.json() as Promise<VideoJobSubmit>;
}

async function pollVideoJob(apiKey: string, pollingUrl: string): Promise<VideoJobStatus> {
  const res = await apiFetch(pollingUrl, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Poll failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<VideoJobStatus>;
}

async function downloadVideo(url: string, apiKey: string): Promise<Uint8Array> {
  const res = await apiFetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export function createVideoCommand(): Command {
  const cmd = new Command("video")
    .description("Generate a video from a text prompt (async)")
    .argument("[prompt...]", "Text prompt describing the video")
    .option("-m, --model <model>", "Video generation model")
    .option("--save <path>", "Output file path", "output.mp4")
    .option("--duration <seconds>", "Target duration in seconds", parseInt)
    .option("--resolution <res>", "Resolution: 480p, 720p, 1080p, 1K, 2K, 4K")
    .option("--aspect-ratio <ratio>", "Aspect ratio: 16:9, 9:16, 1:1, 4:3, 3:4, 3:2, 2:3, 21:9, 9:21")
    .option("--size <WxH>", "Exact pixel dimensions (e.g. 1280x720)")
    .option("--frame-image <path>", "First frame image for image-to-video")
    .option("--reference-image <path>", "Reference image for style guidance")
    .option("--no-audio", "Disable audio generation")
    .option("--seed <n>", "Seed for deterministic generation", parseInt)
    .option("--poll-interval <seconds>", "Polling interval in seconds", parseInt, 30)
    .option("--list-models", "List available video generation models")
    .option("--json", "Output metadata as JSON")
    .option("--quiet", "Suppress non-error output")
    .action(async (promptParts: string[], opts: any) => {
      const apiKey = requireOpenRouterKey();
      const format = getFormat(opts);

      // ── List models mode ────────────────────────────────────────────
      if (opts.listModels) {
        const spinner = opts.quiet ? null : ora("Fetching video models...").start();
        try {
          const models = await fetchVideoModels(apiKey);
          spinner?.stop();

          if (format === "json") {
            console.log(JSON.stringify(models, null, 2));
            return;
          }

          if (opts.quiet) return;

          console.log(chalk.bold("\n  Available Video Generation Models\n"));
          for (const m of models) {
            console.log(`  ${chalk.cyan(m.id)}`);
            if (m.name) console.log(`    ${m.name}`);
            if (m.description) {
              console.log(`    ${chalk.dim(m.description.slice(0, 120))}${m.description.length > 120 ? "..." : ""}`);
            }
            if (m.supported_resolutions?.length) {
              console.log(`    ${chalk.dim("Resolutions:")} ${m.supported_resolutions.join(", ")}`);
            }
            if (m.supported_aspect_ratios?.length) {
              console.log(`    ${chalk.dim("Aspect ratios:")} ${m.supported_aspect_ratios.join(", ")}`);
            }
            if (m.pricing_skus) {
              const prices = Object.entries(m.pricing_skus)
                .map(([k, v]) => `${k}: $${v}`)
                .join(", ");
              console.log(`    ${chalk.dim("Pricing:")} ${prices}`);
            }
            console.log("");
          }
          console.log(chalk.dim(`  ${models.length} model(s)`));
          console.log("");
          return;
        } catch (err) {
          spinner?.fail("Failed to fetch video models");
          error(formatNetworkError(err));
          process.exit(1);
        }
      }

      // ── Resolve prompt ──────────────────────────────────────────────
      let prompt = promptParts.join(" ");
      if (!prompt || !prompt.trim()) {
        if (!process.stdin.isTTY) {
          prompt = await readStdin();
        }
        if (!prompt || !prompt.trim()) {
          error("Error: No prompt provided.");
          process.exit(2);
        }
      }

      // ── Determine model ─────────────────────────────────────────────
      let model = opts.model || getDefaultModel("video");
      if (!model) {
        const spinner = opts.quiet ? null : ora("Finding a video generation model...").start();
        try {
          const models = await fetchVideoModels(apiKey);
          if (models.length === 0) {
            spinner?.fail("No video generation models found.");
            process.exit(1);
          }
          model = models[0]!.id;
          spinner?.stop();
        } catch (err) {
          spinner?.fail("Failed to fetch models");
          error(formatNetworkError(err));
          process.exit(1);
        }
      }

      // ── Build request body ──────────────────────────────────────────
      const body: Record<string, any> = {
        model,
        prompt,
      };

      if (opts.duration !== undefined) body.duration = opts.duration;
      if (opts.resolution) body.resolution = opts.resolution;
      if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;
      if (opts.size) body.size = opts.size;
      if (opts.seed !== undefined) body.seed = opts.seed;
      if (opts.noAudio === true) body.generate_audio = false;

      // Frame images (image-to-video)
      if (opts.frameImage) {
        const imgPath = resolve(opts.frameImage);
        if (!existsSync(imgPath)) {
          error(`Frame image not found: ${opts.frameImage}`);
          process.exit(2);
        }
        const b64 = readFileSync(imgPath).toString("base64");
        const mime = getMimeType(imgPath, IMAGE_EXTS, "image/jpeg");
        body.frame_images = [{
          type: "image_url",
          image_url: { url: `data:${mime};base64,${b64}` },
          frame_type: "first_frame",
        }];
      }

      // Reference images
      if (opts.referenceImage) {
        const imgPath = resolve(opts.referenceImage);
        if (!existsSync(imgPath)) {
          error(`Reference image not found: ${opts.referenceImage}`);
          process.exit(2);
        }
        const b64 = readFileSync(imgPath).toString("base64");
        const mime = getMimeType(imgPath, IMAGE_EXTS, "image/jpeg");
        body.input_references = [{
          type: "image_url",
          image_url: { url: `data:${mime};base64,${b64}` },
        }];
      }

      // ── Submit job ──────────────────────────────────────────────────
      const submitSpinner = opts.quiet ? null : ora(`Submitting video job to ${model}...`).start();
      let job: VideoJobSubmit;
      const startTime = Date.now();

      try {
        job = await submitVideoJob(apiKey, body);
        submitSpinner?.succeed(`Job submitted: ${job.id}`);
      } catch (err) {
        submitSpinner?.fail("Failed to submit video job");
        error(formatNetworkError(err));
        process.exit(1);
      }

      // ── Poll until completion ───────────────────────────────────────
      const pollIntervalMs = Math.max(5000, (opts.pollInterval || 30) * 1000);
      let status: VideoJobStatus;
      let attempts = 0;

      if (!opts.quiet) {
        console.log(chalk.dim(`  Polling every ${pollIntervalMs / 1000}s...`));
      }

      while (true) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        attempts++;

        try {
          status = await pollVideoJob(apiKey, job.polling_url);
        } catch (err) {
          if (!opts.quiet) {
            console.log(chalk.yellow(`  Poll failed (attempt ${attempts}): ${err}`));
          }
          continue;
        }

        if (!opts.quiet) {
          process.stdout.write(chalk.dim(`  ${status.status}`));
          if (status.status === "in_progress") {
            process.stdout.write(chalk.dim(` (${attempts})`));
          }
          process.stdout.write("\n");
        }

        if (status.status === "completed") break;
        if (status.status === "failed") {
          error(`Video generation failed: ${status.error || "Unknown error"}`);
          process.exit(1);
        }
        if (status.status === "cancelled") {
          error("Video generation was cancelled.");
          process.exit(1);
        }
        if (status.status === "expired") {
          error("Video generation expired (exceeded max time to live).");
          process.exit(1);
        }
      }

      const totalLatencyMs = Date.now() - startTime;

      // ── Download video ──────────────────────────────────────────────
      const urls = status.unsigned_urls ?? [];
      if (urls.length === 0) {
        error("Job completed but no download URLs returned.");
        process.exit(1);
      }

      const savePath = resolve(opts.save);
      const dir = dirname(savePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const downloadSpinner = opts.quiet ? null : ora("Downloading video...").start();
      try {
        const videoData = await downloadVideo(urls[0]!, apiKey);
        writeFileSync(savePath, videoData);
        downloadSpinner?.stop();

        const sizeMb = videoData.length / (1024 * 1024);

        if (format === "json") {
          console.log(JSON.stringify({
            model,
            prompt,
            job_id: job.id,
            generation_id: status.generation_id,
            output: savePath,
            size_bytes: videoData.length,
            size_mb: Math.round(sizeMb * 10) / 10,
            latency_ms: totalLatencyMs,
            polls: attempts,
            cost: status.usage?.cost,
          }, null, 2));
        } else if (!opts.quiet) {
          console.log("");
          console.log(chalk.green(`✓ Saved to ${savePath} (${sizeMb.toFixed(1)}MB)`));
          console.log(chalk.dim(`  Model: ${model} • Job: ${job.id}`));
          if (status.generation_id) console.log(chalk.dim(`  Generation: ${status.generation_id}`));
          console.log(chalk.dim(`  Latency: ${(totalLatencyMs / 1000).toFixed(0)}s • Polls: ${attempts}`));
          if (status.usage?.cost != null) console.log(chalk.dim(`  Cost: $${status.usage.cost.toFixed(2)}`));
          console.log("");
        }
      } catch (err) {
        downloadSpinner?.fail("Download failed");
        error(formatNetworkError(err));
        process.exit(1);
      }
    });

  return cmd;
}

// ── Audio / TTS ──────────────────────────────────────────────────────────────

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
  if (prompt > 0) return `$${(prompt * 1_000_000).toFixed(2)}/1M chars`;
  if (request > 0) return `$${request.toFixed(4)}/request`;
  return "free";
}

function estimateTTSCost(model: TTSModel, text: string): number {
  const prompt = parseFloat(model.pricing?.prompt ?? "0");
  const request = parseFloat(model.pricing?.request ?? "0");
  return text.length * prompt + request;
}

export function createAudioCommand(): Command {
  const cmd = new Command("audio")
    .description("Generate speech audio from text (TTS)")
    .argument("[input...]", "Text to synthesize")
    .option("-m, --model <model>", "TTS model", "hexgrad/kokoro-82m")
    .option("-v, --voice <voice>", "Voice identifier", "af_alloy")
    .option("-o, --output <path>", "Output file path", "output.mp3")
    .option("-f, --format <format>", "Output format: mp3 or pcm", "mp3")
    .option("-s, --speed <n>", "Playback speed (0.5-2.0)", parseFloat)
    .option("--input <text>", "Text to synthesize (alternative to positional arg)")
    .option("--list-models", "List available TTS models")
    .option("--list-voices", "List supported voices for selected model")
    .option("--dry-run", "Show cost estimate without generating")
    .option("--json", "Output metadata as JSON")
    .option("--quiet", "Suppress non-error output")
    .action(async (inputParts: string[], opts: any) => {
      const apiKey = requireOpenRouterKey();
      const format = getFormat(opts);

      // ── List voices mode ────────────────────────────────────────────
      if (opts.listVoices) {
        const spinner = opts.quiet ? null : ora(`Fetching voices for ${opts.model}...`).start();
        try {
          const models = await fetchTTSModels(apiKey);
          const model = models.find((m) => m.id === opts.model);
          if (!model) {
            spinner?.fail(`Model not found: ${opts.model}`);
            if (!opts.quiet) {
              console.log(chalk.dim("Use `or create audio --list-models` to see available models."));
            }
            process.exit(2);
          }
          spinner?.stop();

          const voices = model.supported_voices ?? [];

          if (format === "json") {
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
          for (const v of voices) console.log(`    • ${v}`);
          console.log("");
          return;
        } catch (err) {
          spinner?.fail("Failed to fetch voices");
          if (!opts.quiet) console.error(chalk.red(formatNetworkError(err)));
          process.exit(1);
        }
      }

      // ── List models mode ────────────────────────────────────────────
      if (opts.listModels) {
        const spinner = opts.quiet ? null : ora("Fetching TTS models...").start();
        try {
          const models = await fetchTTSModels(apiKey);
          spinner?.stop();

          if (format === "json") {
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
          spinner?.fail("Failed to fetch TTS models");
          if (!opts.quiet) console.error(chalk.red(formatNetworkError(err)));
          process.exit(1);
        }
      }

      // ── Synthesis mode ──────────────────────────────────────────────
      const text = opts.input ?? inputParts.join(" ");
      if (!text || !text.trim()) {
        if (!process.stdin.isTTY) {
          const stdin = await readStdin();
          if (stdin.trim()) {
            // Use stdin as text
          } else {
            error("Error: No text provided.");
            process.exit(2);
          }
        } else {
          error("Error: No text provided. Pass as argument or use --input.");
          process.exit(2);
        }
      }
      const finalText = text || (await readStdin());

      const modelId = opts.model!;
      const voice = opts.voice!;
      const outputFormat = opts.format ?? "mp3";
      const outputPath = resolve(opts.output ?? "output.mp3");

      // Fetch model info
      let ttsModel: TTSModel | undefined;
      try {
        const models = await fetchTTSModels(apiKey);
        ttsModel = models.find((m) => m.id === modelId);
      } catch {
        // Continue without model info
      }

      // Validate voice
      if (ttsModel?.supported_voices && ttsModel.supported_voices.length > 0) {
        if (!ttsModel.supported_voices.includes(voice)) {
          error(`Invalid voice "${voice}" for model ${modelId}`);
          if (!opts.quiet) {
            console.error(chalk.dim(`  Valid voices: ${ttsModel.supported_voices.join(", ")}`));
          }
          process.exit(2);
        }
      }

      const cost = ttsModel ? estimateTTSCost(ttsModel, finalText) : null;
      if (cost !== null && cost > 0 && !opts.quiet) {
        console.log(chalk.dim(`  Estimated cost: $${cost.toFixed(4)} (${finalText.length} chars)`));
      }

      if (opts.dryRun) {
        if (!opts.quiet) {
          console.log(chalk.blue("ℹ Dry run — no audio generated."));
        }
        return;
      }

      const body: Record<string, any> = {
        model: modelId,
        input: finalText,
        voice,
        response_format: outputFormat,
      };
      if (opts.speed !== undefined) body.speed = opts.speed;

      const spinner = opts.quiet ? null : ora(`Synthesizing speech with ${modelId}...`).start();

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

          if (res.status === 400 && errBody.toLowerCase().includes("voice")) {
            error("Invalid voice parameter.");
            if (!opts.quiet) {
              console.error(chalk.dim(`  Run \`or create audio --list-voices -m ${modelId}\` to see valid voices.`));
            }
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

        const dir = dirname(outputPath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(outputPath, new Uint8Array(audioBuffer));

        const sizeKb = audioBuffer.byteLength / 1024;

        if (format === "json") {
          console.log(JSON.stringify({
            model: modelId,
            voice,
            input: finalText,
            format: outputFormat,
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
        if (generationId) console.log(chalk.dim(`  Generation ID: ${generationId}`));
        console.log(chalk.dim(`  Model: ${modelId} • Voice: ${voice} • Format: ${outputFormat}`));
        if (cost !== null && cost > 0) console.log(chalk.dim(`  Cost: $${cost.toFixed(4)}`));
        console.log("");
      } catch (err) {
        spinner?.fail("Failed to synthesize speech");
        error(formatNetworkError(err));
        process.exit(1);
      }
    });

  return cmd;
}

// ── Main create command ──────────────────────────────────────────────────────

export function createCommand(): Command {
  const cmd = new Command("create")
    .description("Generate media (image, video, audio)")
    .addCommand(createImageCommand())
    .addCommand(createVideoCommand())
    .addCommand(createAudioCommand());

  return cmd;
}
