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
