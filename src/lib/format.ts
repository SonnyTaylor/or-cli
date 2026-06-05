import chalk from "chalk";
import Table from "cli-table3";
import type { OutputFormat } from "./types";

export function getFormat(flags: { json?: boolean; md?: boolean }): OutputFormat {
  if (flags.json) return "json";
  if (flags.md) return "md";
  return "table";
}

export function output(data: unknown, format: OutputFormat, quiet = false): void {
  if (format === "json") {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (typeof data === "string") {
    if (!quiet) console.log(data);
    return;
  }
  // For table/md, data should be handled by specific commands
  console.log(data);
}

export function outputTable(headers: string[], rows: string[][], format: OutputFormat): void {
  if (format === "json") {
    const objects = rows.map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => (obj[h] = row[i] ?? ""));
      return obj;
    });
    console.log(JSON.stringify(objects, null, 2));
    return;
  }

  if (format === "md") {
    console.log("| " + headers.join(" | ") + " |");
    console.log("| " + headers.map(() => "---").join(" | ") + " |");
    for (const row of rows) {
      console.log("| " + row.join(" | ") + " |");
    }
    return;
  }

  // table
  const table = new Table({
    head: headers.map((h) => chalk.cyan(h)),
    style: { head: [], border: [] },
  });
  table.push(...rows);
  console.log(table.toString());
}

export function formatPrice(pricePerToken: string | number): number {
  const n = typeof pricePerToken === "string" ? parseFloat(pricePerToken) : pricePerToken;
  return n * 1_000_000; // convert to per-1M
}

export function formatPriceStr(pricePerMillion: number | undefined): string {
  if (pricePerMillion === undefined) return "—";
  if (pricePerMillion === 0) return "free";
  if (pricePerMillion < 0.01) return "<$0.01";
  return `$${pricePerMillion.toFixed(2)}`;
}

export function formatPerImagePrice(pricePerImageToken: number | null | undefined): string {
  if (pricePerImageToken == null || pricePerImageToken === 0) return "free";
  // Convert per-token to per-image (assuming ~1000 tokens per image)
  const pricePerImage = pricePerImageToken * 1000;
  if (pricePerImage < 0.01) return "<$0.01/img";
  return `$${pricePerImage.toFixed(2)}/img`;
}

export function formatRequestPrice(pricePerRequest: number): string {
  if (pricePerRequest === 0) return "free";
  if (pricePerRequest < 0.0001) return "<$0.0001/req";
  if (pricePerRequest < 0.01) return `$${pricePerRequest.toFixed(4)}/req`;
  return `$${pricePerRequest.toFixed(2)}/req`;
}

export function formatAudioPrice(pricePerAudioToken: number): string {
  if (pricePerAudioToken === 0) return "free";
  const perM = pricePerAudioToken * 1_000_000;
  if (perM < 0.01) return "<$0.01/M audio";
  return `$${perM.toFixed(2)}/M audio`;
}

const PRICING_LABELS: Record<string, string> = {
  prompt: "Prompt",
  completion: "Completion",
  request: "Request",
  image: "Image",
  image_output: "Image output",
  image_token: "Image token",
  audio: "Audio",
  audio_output: "Audio output",
  web_search: "Web search",
  internal_reasoning: "Reasoning",
  input_cache_read: "Cache read",
  input_cache_write: "Cache write",
  input_audio_cache: "Audio cache",
};

const PRICING_UNITS: Record<string, string> = {
  prompt: "/ 1M tokens",
  completion: "/ 1M tokens",
  request: "",
  image: "/ image",
  image_output: "/ image",
  image_token: "/ 1M image tokens",
  audio: "/ 1M audio tokens",
  audio_output: "/ 1M audio tokens",
  web_search: "/ search",
  internal_reasoning: "/ 1M tokens",
  input_cache_read: "/ 1M tokens",
  input_cache_write: "/ 1M tokens",
  input_audio_cache: "/ 1M tokens",
};

/**
 * Format a single pricing dimension for display in `or show`.
 * Returns null if the price is zero/undefined.
 */
export function formatPricingDimension(
  key: string,
  value: string | number | undefined
): string | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n) || n === 0) return null;

  const label = PRICING_LABELS[key] ?? key;
  const unit = PRICING_UNITS[key] ?? "";

  // Per-request prices show raw value; token/unit prices show per-1M
  const isPerRequest = key === "request" || key === "web_search";
  const displayValue = isPerRequest
    ? n < 0.0001
      ? "<$0.0001"
      : n < 0.01
        ? `$${n.toFixed(4)}`
        : `$${n.toFixed(2)}`
    : formatPriceStr(n * 1_000_000);

  return `    ${label.padEnd(14)} ${displayValue}${unit ? " " + unit : ""}`;
}

/**
 * Get all non-zero pricing dimensions as formatted strings.
 * Ordered by relevance for display.
 */
export function formatAllPricing(
  pricing: Record<string, unknown>
): string[] {
  const order = [
    "prompt",
    "completion",
    "image_output",
    "image",
    "image_token",
    "audio_output",
    "audio",
    "request",
    "web_search",
    "internal_reasoning",
    "input_cache_read",
    "input_cache_write",
    "input_audio_cache",
  ];
  const lines: string[] = [];
  for (const key of order) {
    const line = formatPricingDimension(key, pricing[key] as string | number | undefined);
    if (line) lines.push(line);
  }
  return lines;
}

export function formatTps(tps: number | undefined): string {
  if (tps === undefined) return "—";
  if (tps < 1) return `${(tps * 1000).toFixed(0)}ms`;
  return `${tps.toFixed(1)} t/s`;
}

export function formatPercent(pct: number | undefined | null): string {
  if (pct == null) return "—";
  return `${pct.toFixed(1)}%`;
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

export function modalityEmoji(modality: string): string {
  const m = modality.toLowerCase();
  if (m.includes("image") && m.includes("text")) return "👁";
  if (m.includes("image")) return "🖼";
  if (m.includes("audio") || m.includes("speech")) return "🔊";
  if (m.includes("video")) return "🎬";
  if (m.includes("embedding")) return "📐";
  return "💬";
}

export function capabilityFlags(params: string[]): string[] {
  const flags: string[] = [];
  if (params.includes("tools")) flags.push("🔧 tools");
  if (params.includes("response_format")) flags.push("📋 json");
  if (params.includes("temperature")) flags.push("🎛 temp");
  return flags;
}

export function success(msg: string): void {
  console.log(chalk.green("✓") + " " + msg);
}

export function error(msg: string): void {
  console.error(chalk.red("✗") + " " + msg);
}

export function warn(msg: string): void {
  console.log(chalk.yellow("⚠") + " " + msg);
}

export function info(msg: string): void {
  console.log(chalk.blue("ℹ") + " " + msg);
}

export function formatCtx(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function formatCtxLong(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M tokens`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K tokens`;
  return `${n} tokens`;
}

/**
 * Estimate cost for a given model based on typical token usage.
 * Returns { input, output, total } in dollars.
 */
export function estimateCost(
  inputPricePerM: number,
  outputPricePerM: number,
  inputTokens: number,
  outputTokens: number
): { input: number; output: number; total: number } {
  const input = (inputPricePerM / 1_000_000) * inputTokens;
  const output = (outputPricePerM / 1_000_000) * outputTokens;
  return { input, output, total: input + output };
}

export function formatDollars(cents: number): string {
  if (cents < 0.001) return "$0.00";
  if (cents < 0.01) return `$${cents.toFixed(4)}`;
  return `$${cents.toFixed(2)}`;
}

/** Warn if --quiet is used on a command that doesn't support it. */
export function guardQuiet(opts: { quiet?: boolean }): boolean {
  if (opts.quiet) {
    console.error(
      chalk.yellow("⚠ --quiet is only supported on `or chat`. ") +
      chalk.dim("Use --json for machine-readable output on other commands.")
    );
    return false;
  }
  return true;
}
