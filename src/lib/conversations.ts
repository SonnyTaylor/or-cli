import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { getConfigDir } from "./config";
import { createHash } from "crypto";
import type { ChatMessage } from "./types";

const CONV_DIR = join(getConfigDir(), "conversations");

function ensureDir() {
  if (!existsSync(CONV_DIR)) {
    mkdirSync(CONV_DIR, { recursive: true });
  }
}

export interface ConversationMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  messageCount: number;
  title?: string;
}

export interface ConversationEntry {
  role: "system" | "user" | "assistant";
  content: string | ChatMessage["content"];
  model?: string;        // which model responded (on assistant turns)
  timestamp: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costEstimate?: number;
  latencyMs?: number;
}

/**
 * Generate a short random conversation ID.
 */
export function generateConvId(): string {
  return createHash("sha256")
    .update(Date.now().toString() + Math.random().toString())
    .digest("hex")
    .slice(0, 8);
}

/**
 * Get the file path for a conversation.
 */
function convPath(id: string): string {
  return join(CONV_DIR, `${id}.jsonl`);
}

/**
 * Create a new conversation and return its ID.
 */
export function createConversation(
  systemPrompt: string | undefined,
  firstUserMessage: ChatMessage["content"],
  model: string,
  assistantResponse: string,
  meta?: { usage?: ConversationEntry["usage"]; costEstimate?: number; latencyMs?: number }
): string {
  ensureDir();
  const id = generateConvId();
  const now = new Date().toISOString();

  const entries: ConversationEntry[] = [];

  if (systemPrompt) {
    entries.push({ role: "system", content: systemPrompt, timestamp: now });
  }

  entries.push({ role: "user", content: firstUserMessage, timestamp: now });
  entries.push({
    role: "assistant",
    content: assistantResponse,
    model,
    timestamp: now,
    usage: meta?.usage,
    costEstimate: meta?.costEstimate,
    latencyMs: meta?.latencyMs,
  });

  writeFileSync(convPath(id), entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  return id;
}

/**
 * Append a user message and assistant response to an existing conversation.
 */
export function appendConversation(
  id: string,
  userMessage: ChatMessage["content"],
  assistantResponse: string,
  model: string,
  meta?: { usage?: ConversationEntry["usage"]; costEstimate?: number; latencyMs?: number }
): void {
  ensureDir();
  const now = new Date().toISOString();

  const entries: ConversationEntry[] = [
    { role: "user", content: userMessage, timestamp: now },
    {
      role: "assistant",
      content: assistantResponse,
      model,
      timestamp: now,
      usage: meta?.usage,
      costEstimate: meta?.costEstimate,
      latencyMs: meta?.latencyMs,
    },
  ];

  appendFileSync(convPath(id), entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

/**
 * Load all messages from a conversation as ChatMessage[] for the API.
 */
export function loadConversation(id: string): ConversationEntry[] {
  const path = convPath(id);
  if (!existsSync(path)) return [];

  const raw = readFileSync(path, "utf-8").trim();
  if (!raw) return [];

  return raw.split("\n").filter(Boolean).map((line) => {
    try {
      return JSON.parse(line) as ConversationEntry;
    } catch {
      return null;
    }
  }).filter(Boolean) as ConversationEntry[];
}

/**
 * Convert ConversationEntry[] to ChatMessage[] for the API.
 */
export function toMessages(entries: ConversationEntry[]): ChatMessage[] {
  return entries.map((e) => ({
    role: e.role as ChatMessage["role"],
    content: e.content,
  }));
}

/**
 * Get the most recent conversation ID.
 */
export function getLastConversationId(): string | null {
  ensureDir();
  const files = readdirSync(CONV_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => ({
      name: f.replace(".jsonl", ""),
      time: require("fs").statSync(join(CONV_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.time - a.time);

  return files.length > 0 ? files[0]!.name : null;
}

/**
 * List all conversations with metadata.
 */
export function listConversations(limit?: number): ConversationMeta[] {
  ensureDir();
  const files = readdirSync(CONV_DIR).filter((f) => f.endsWith(".jsonl"));

  const metas: ConversationMeta[] = files.map((f) => {
    const id = f.replace(".jsonl", "");
    const entries = loadConversation(id);
    if (entries.length === 0) return null;

    const firstUser = entries.find((e) => e.role === "user");
    const firstAssistant = entries.find((e) => e.role === "assistant");
    const lastEntry = entries[entries.length - 1]!;

    // Extract model from first assistant response
    const model = firstAssistant?.model ?? "unknown";

    // Generate a title from the first user message (first 60 chars)
    const firstContent = typeof firstUser?.content === "string"
      ? firstUser.content
      : JSON.stringify(firstUser?.content ?? "");
    const title = firstContent.slice(0, 60) + (firstContent.length > 60 ? "..." : "");

    // Count user messages
    const messageCount = entries.filter((e) => e.role === "user").length;

    return {
      id,
      createdAt: entries[0]!.timestamp,
      updatedAt: lastEntry.timestamp,
      model,
      messageCount,
      title,
    };
  }).filter(Boolean) as ConversationMeta[];

  // Sort by most recent
  metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return limit ? metas.slice(0, limit) : metas;
}

/**
 * Delete a conversation.
 */
export function deleteConversation(id: string): boolean {
  const path = convPath(id);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}
