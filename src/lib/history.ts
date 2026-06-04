import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getConfigDir } from "./config";
import { createHash } from "crypto";

const HISTORY_DIR = join(getConfigDir(), "history");
const HISTORY_FILE = join(HISTORY_DIR, "chat.jsonl");

export interface HistoryEntry {
  id: string;
  timestamp: string;       // ISO 8601
  model: string;
  provider?: string;
  systemPrompt?: string;
  prompt: string;
  response: string;
  finishReason?: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costEstimate?: number;   // USD, calculated from pricing
  latencyMs: number;
  temperature?: number;
  maxTokens?: number;
}

function ensureDir() {
  if (!existsSync(HISTORY_DIR)) {
    mkdirSync(HISTORY_DIR, { recursive: true });
  }
}

export function appendHistory(entry: HistoryEntry): void {
  ensureDir();
  appendFileSync(HISTORY_FILE, JSON.stringify(entry) + "\n");
}

export function readHistory(limit?: number): HistoryEntry[] {
  if (!existsSync(HISTORY_FILE)) return [];
  const raw = readFileSync(HISTORY_FILE, "utf-8").trim();
  if (!raw) return [];

  const lines = raw.split("\n").filter(Boolean);
  const entries = lines.map((line) => {
    try {
      return JSON.parse(line) as HistoryEntry;
    } catch {
      return null;
    }
  }).filter(Boolean) as HistoryEntry[];

  // Most recent first
  entries.reverse();
  return limit ? entries.slice(0, limit) : entries;
}

export function searchHistory(query: string, limit?: number): HistoryEntry[] {
  const q = query.toLowerCase();
  const all = readHistory();
  const matched = all.filter(
    (e) =>
      e.prompt.toLowerCase().includes(q) ||
      e.response.toLowerCase().includes(q) ||
      e.model.toLowerCase().includes(q) ||
      (e.systemPrompt?.toLowerCase().includes(q) ?? false)
  );
  return limit ? matched.slice(0, limit) : matched;
}

export function getHistoryEntry(id: string): HistoryEntry | null {
  const all = readHistory();
  return all.find((e) => e.id === id) ?? null;
}

export function clearHistory(): number {
  if (!existsSync(HISTORY_FILE)) return 0;
  const raw = readFileSync(HISTORY_FILE, "utf-8").trim();
  const count = raw ? raw.split("\n").filter(Boolean).length : 0;
  writeFileSync(HISTORY_FILE, "");
  return count;
}

export function historyStats(): { totalEntries: number; totalTokens: number; totalCost: number; models: Map<string, number> } {
  const all = readHistory();
  let totalTokens = 0;
  let totalCost = 0;
  const models = new Map<string, number>();

  for (const e of all) {
    totalTokens += e.usage.totalTokens;
    totalCost += e.costEstimate ?? 0;
    models.set(e.model, (models.get(e.model) ?? 0) + 1);
  }

  return { totalEntries: all.length, totalTokens, totalCost, models };
}

export function generateId(): string {
  return createHash("sha256")
    .update(Date.now().toString() + Math.random().toString())
    .digest("hex")
    .slice(0, 8);
}
