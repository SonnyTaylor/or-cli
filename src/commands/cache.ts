import { Command } from "commander";
import chalk from "chalk";
import { clearCache, cacheStats } from "../lib/cache";
import { success } from "../lib/format";

export function cacheCommand(): Command {
  const cmd = new Command("cache")
    .description("Manage response cache")
    .option("--stats", "Show cache statistics")
    .option("--clear", "Clear all cached data")
    .option("--quiet", "Suppress non-error output")
    .action((opts) => {
      if (opts.clear) {
        const count = clearCache();
        success(`Cleared ${count} cached files`);
        return;
      }

      // Default: show stats
      const stats = cacheStats();
      console.log(chalk.bold("Cache statistics:\n"));
      console.log(`  Cached entries: ${stats.count}`);
      console.log(`  Total size:    ${formatBytes(stats.totalSize)}`);
      if (stats.oldestAge !== null) {
        console.log(`  Oldest entry:  ${formatAge(stats.oldestAge)} ago`);
      }
      console.log("");
      console.log(chalk.dim("  Use `or cache --clear` to purge the cache."));
    });

  return cmd;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
