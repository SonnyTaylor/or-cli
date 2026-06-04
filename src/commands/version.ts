import { Command } from "commander";
import chalk from "chalk";
import { readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

function getPackageVersion(): string {
  try {
    const pkgPath = join(__dirname, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version;
  } catch {
    return "unknown";
  }
}

function getGitCommit(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

function getRuntime(): string {
  if (typeof Bun !== "undefined") return `bun ${Bun.version}`;
  return `node ${process.version}`;
}

export function versionCommand(): Command {
  return new Command("version")
    .description("Show version and environment info")
    .action(() => {
      const version = getPackageVersion();
      const commit = getGitCommit();
      const runtime = getRuntime();

      console.log("");
      console.log(chalk.bold(`  or-cli v${version}`));
      if (commit) console.log(chalk.dim(`  commit:   ${commit}`));
      console.log(chalk.dim(`  runtime:  ${runtime}`));
      console.log(chalk.dim(`  platform: ${process.platform} ${process.arch}`));
      console.log("");
    });
}
