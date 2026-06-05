import { Command } from "commander";
import chalk from "chalk";
import { getConfig, getORKey, getAAKey, isInsecure } from "../lib/config";
import { readHistory } from "../lib/history";
import { existsSync } from "fs";
import { join } from "path";
import { getConfigDir } from "../lib/config";
import { apiFetch, isTlsError, isConnectError } from "../lib/fetch";

interface CheckResult {
  label: string;
  ok: boolean;
  detail: string;
}

async function checkNetwork(): Promise<CheckResult> {
  try {
    const res = await apiFetch("https://openrouter.ai/api/v1/models?limit=1", {
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok || res.status === 401) {
      return { label: "Network (OpenRouter)", ok: true, detail: "Reachable" };
    }
    return { label: "Network (OpenRouter)", ok: true, detail: `HTTP ${res.status} (may need auth)` };
  } catch (err) {
    if (isTlsError(err)) {
      return {
        label: "Network (OpenRouter)",
        ok: false,
        detail: "SSL certificate error (corporate DPI/proxy?). Try `or config --insecure` or NODE_TLS_REJECT_UNAUTHORIZED=0",
      };
    }
    if (isConnectError(err)) {
      return {
        label: "Network (OpenRouter)",
        ok: false,
        detail: "Cannot connect. Check internet / firewall / proxy.",
      };
    }
    return { label: "Network (OpenRouter)", ok: false, detail: `Error: ${String(err).slice(0, 60)}` };
  }
}

async function checkORKey(): Promise<CheckResult> {
  const key = getORKey();
  if (!key) {
    return { label: "OpenRouter API Key", ok: false, detail: "Not set. Run `or auth` or set OPENROUTER_API_KEY" };
  }

  // Test connectivity
  try {
    const res = await apiFetch("https://openrouter.ai/api/v1/models?limit=1", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      return { label: "OpenRouter API Key", ok: true, detail: `Valid (${key.slice(0, 12)}...)` };
    }
    return { label: "OpenRouter API Key", ok: false, detail: `Invalid or expired (HTTP ${res.status})` };
  } catch (err) {
    if (isTlsError(err)) {
      return {
        label: "OpenRouter API Key",
        ok: true,
        detail: `Set but SSL error (DPI/proxy?). Run with NODE_TLS_REJECT_UNAUTHORIZED=0 or \`or config --insecure\``,
      };
    }
    return { label: "OpenRouter API Key", ok: true, detail: `Set but could not verify (network error)` };
  }
}

async function checkAAKey(): Promise<CheckResult> {
  const key = getAAKey();
  if (!key) {
    return { label: "Artificial Analysis Key", ok: false, detail: "Not set. Run `or auth --aa-key <key>`" };
  }

  try {
    const res = await apiFetch("https://artificialanalysis.ai/api/v2/data/llms/models", {
      headers: { "x-api-key": key },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      return { label: "Artificial Analysis Key", ok: true, detail: `Valid (${key.slice(0, 12)}...)` };
    }
    if (res.status === 429) {
      return { label: "Artificial Analysis Key", ok: true, detail: `Valid but rate-limited (try again later)` };
    }
    return { label: "Artificial Analysis Key", ok: false, detail: `Invalid (HTTP ${res.status})` };
  } catch (err) {
    if (isTlsError(err)) {
      return {
        label: "Artificial Analysis Key",
        ok: true,
        detail: `Set but SSL error (DPI/proxy?). Try NODE_TLS_REJECT_UNAUTHORIZED=0`,
      };
    }
    return { label: "Artificial Analysis Key", ok: true, detail: `Set but could not verify (network error)` };
  }
}

function checkRuntime(): CheckResult {
  const runtime = typeof Bun !== "undefined" ? `bun ${Bun.version}` : `node ${process.version}`;
  return { label: "Runtime", ok: true, detail: runtime };
}

function checkConfig(): CheckResult {
  const configDir = getConfigDir();
  const configFile = join(configDir, "config.json");
  if (existsSync(configFile)) {
    return { label: "Config", ok: true, detail: configFile };
  }
  return { label: "Config", ok: true, detail: `${configFile} (will be created on first use)` };
}

function checkCache(): CheckResult {
  const cacheDir = join(getConfigDir(), "cache");
  if (existsSync(cacheDir)) {
    return { label: "Cache", ok: true, detail: cacheDir };
  }
  return { label: "Cache", ok: true, detail: `${cacheDir} (will be created on first use)` };
}

function checkHistory(): CheckResult {
  const entries = readHistory();
  if (entries.length === 0) {
    return { label: "History", ok: true, detail: "No entries yet" };
  }
  const totalCost = entries.reduce((sum, e) => sum + (e.costEstimate ?? 0), 0);
  return { label: "History", ok: true, detail: `${entries.length} entries, ~$${totalCost.toFixed(4)} spent` };
}

function checkPlatform(): CheckResult {
  return { label: "Platform", ok: true, detail: `${process.platform} ${process.arch}` };
}

export function doctorCommand(): Command {
  return new Command("doctor")
    .description("Check CLI configuration and connectivity")
    .action(async () => {
      console.log(chalk.bold("\n  or-cli doctor\n"));

      const checks: CheckResult[] = [];

      // Sync checks
      checks.push(checkRuntime());
      checks.push(checkPlatform());
      checks.push(checkConfig());
      checks.push(checkCache());
      checks.push(checkHistory());

      // Async checks
      checks.push(await checkNetwork());
      checks.push(await checkORKey());
      checks.push(await checkAAKey());

      // SSL mode warning
      if (isInsecure()) {
        checks.push({
          label: "SSL Verification",
          ok: true,
          detail: "Disabled (insecure mode) — connections may be vulnerable to MITM",
        });
      }

      // Print results
      const maxLabel = Math.max(...checks.map((c) => c.label.length));
      let allOk = true;

      for (const check of checks) {
        const icon = check.ok ? chalk.green("✓") : chalk.red("✗");
        const label = check.label.padEnd(maxLabel);
        console.log(`  ${icon} ${label}  ${chalk.dim(check.detail)}`);
        if (!check.ok) allOk = false;
      }

      console.log("");
      if (allOk) {
        console.log(chalk.green("  All checks passed!"));
      } else {
        console.log(chalk.yellow("  Some checks failed — see above for details."));
      }
      console.log("");
    });
}
