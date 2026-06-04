import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CONFIG_DIR = join(homedir(), ".or-cli");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface Config {
  openrouterApiKey?: string;
  artificialAnalysisApiKey?: string;
  defaultModel?: string;
  cacheTtlMs: number; // default 6 hours
}

const DEFAULTS: Config = {
  cacheTtlMs: 6 * 60 * 60 * 1000,
};

function ensureDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function getConfig(): Config {
  ensureDir();
  if (!existsSync(CONFIG_FILE)) {
    return { ...DEFAULTS };
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setConfig(partial: Partial<Config>): Config {
  const current = getConfig();
  const updated = { ...current, ...partial };
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
  return updated;
}

export function getConfigDir(): string {
  ensureDir();
  return CONFIG_DIR;
}

export function requireOpenRouterKey(): string {
  // Env var takes precedence
  if (process.env.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY;
  }
  const config = getConfig();
  if (config.openrouterApiKey) {
    return config.openrouterApiKey;
  }
  console.error(
    "Error: No OpenRouter API key found.\n" +
    "Run `or auth` to set your key, or set OPENROUTER_API_KEY env var."
  );
  process.exit(1);
}

export function getAAKey(): string | undefined {
  if (process.env.ARTIFICIAL_ANALYSIS_API_KEY) {
    return process.env.ARTIFICIAL_ANALYSIS_API_KEY;
  }
  return getConfig().artificialAnalysisApiKey;
}
