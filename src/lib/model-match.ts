// ── AA ↔ OpenRouter model matching ───────────────────────────────────────────
//
// Artificial Analysis and OpenRouter identify the same model differently:
//
//   AA slug:  claude-opus-4-8            OR id:  anthropic/claude-opus-4.8
//   AA slug:  gpt-5-6-sol-xhigh          OR id:  openai/gpt-5.6-sol       (effort variant)
//   AA name:  Nano Banana 2 (Gemini 3.1 Flash Image Preview)
//                                        OR id:  google/gemini-3.1-flash-image-preview
//   AA creator: kimi / xai / alibaba     OR org: moonshotai / x-ai / qwen
//
// This module canonicalizes both sides into token lists and scores candidates,
// with hard constraints (numeric version tokens must agree exactly, creator
// must be compatible) so "4.7" never fuzzy-matches "4.8".

import type { AAModel, AAMediaModel, ORModel } from "./types";

// AA creator slug → acceptable OR org prefixes (beyond the generic
// substring rule below). Keep lowercase, alphanumeric-only keys.
const CREATOR_ALIASES: Record<string, string[]> = {
  xai: ["x-ai"],
  spacexai: ["x-ai"],
  kimi: ["moonshotai"],
  moonshot: ["moonshotai"],
  moonshotai: ["moonshotai"],
  zai: ["z-ai"],
  zhipu: ["z-ai", "thudm"],
  alibaba: ["qwen", "alibaba"],
  meta: ["meta-llama", "meta"],
  microsoftai: ["microsoft"],
  microsoft: ["microsoft"],
  bytedance: ["bytedance-seed", "bytedance"],
  blackforestlabs: ["black-forest-labs"],
  bfl: ["black-forest-labs"],
  mistral: ["mistralai", "mistral"],
  nousresearch: ["nousresearch"],
  liquidai: ["liquid"],
  ibm: ["ibm-granite", "ibm"],
  stepfun: ["stepfun-ai", "stepfun"],
};

// Pure reasoning-effort / run-configuration markers. These distinguish AA
// benchmark runs, not models, so they are stripped before matching.
// Deliberately NOT included: "max", "thinking", "mini", "pro" — those are
// part of real model names (Qwen3.7 Max, Kimi K2 Thinking, GPT-5 Mini).
const EFFORT_TOKENS = new Set([
  "low", "medium", "high", "xhigh", "minimal",
  "adaptive", "reasoning", "non", "nonreasoning", "effort",
]);

// Parenthetical content in AA names that is pure run configuration,
// e.g. "GPT-5.5 (xhigh)", "Claude Opus 4.8 (Adaptive Reasoning, Max Effort)".
const EFFORT_PAREN = /^(low|medium|high|xhigh|max|minimal|agentic|(adaptive |non-)?reasoning.*|.*effort)$/i;

function normalizeToken(t: string): string | null {
  // strip a leading "v" from version tokens: v4 → 4 (recraft-v4 vs "Recraft V4")
  if (/^v\d/.test(t)) t = t.slice(1);
  if (t === "v") return null;
  return t || null;
}

/** Canonical token list: lowercase, split on non-alphanumerics and
 *  letter/digit boundaries, version-normalized. "GPT-5.6 Sol" → [gpt,5,6,sol] */
export function tokenize(s: string): string[] {
  const raw = s
    .toLowerCase()
    .replace(/[_.]/g, "-")
    .split(/[^a-z0-9]+/)
    .flatMap((part) => part.match(/[a-z]+|\d+/g) ?? []);
  const out: string[] = [];
  for (const t of raw) {
    const n = normalizeToken(t);
    if (n) out.push(n);
  }
  return out;
}

function stripEffortTokens(tokens: string[]): string[] {
  // Only strip effort markers from the END of the list, so a hypothetical
  // model with "high" mid-name is unaffected.
  const out = [...tokens];
  while (out.length > 1 && EFFORT_TOKENS.has(out[out.length - 1]!)) out.pop();
  return out;
}

/** Extract name variants from an AA model: base name, slug, and any
 *  parenthetical alternate names ("Nano Banana 2 (Gemini 3.1 Flash Image)"). */
export function aaNameVariants(name: string, slug?: string): string[] {
  const variants: string[] = [];
  const parens = [...name.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]!.trim());
  const base = name.replace(/\([^)]*\)/g, " ").trim();
  if (base) variants.push(base);
  for (const p of parens) {
    if (!EFFORT_PAREN.test(p)) variants.push(p); // real alternate name
  }
  if (slug) variants.push(slug);
  return variants;
}

function numericTokens(tokens: string[]): string {
  return tokens.filter((t) => /^\d+$/.test(t)).join(".");
}

// AA tokens that may be absent from the OR id without disqualifying a match
// (release-stage noise). Anything else missing — flash, lite, mini, codex… —
// names a different model and is a hard reject.
const IGNORABLE_MISSING = new Set(["preview", "beta", "exp", "latest", "it"]);

/** Score how well an AA token variant matches an OR model's tokens.
 *  Returns -1 for a hard mismatch. Higher is better; 100 = exact. */
function scoreTokens(aa: string[], or: string[]): number {
  if (aa.length === 0 || or.length === 0) return -1;

  // Hard constraint: the numeric version sequence must match exactly.
  // [gpt,5,6,sol] vs [gpt,5,5] → "5.6" ≠ "5.5" → reject.
  if (numericTokens(aa) !== numericTokens(or)) return -1;

  const aaSet = new Set(aa);
  const orSet = new Set(or);
  let shared = 0;
  for (const t of aaSet) if (orSet.has(t)) shared++;

  const aaMissing = aa.filter((t) => !orSet.has(t));        // AA tokens OR lacks
  const orExtra = or.filter((t) => !aaSet.has(t)).length;   // OR distinguishing tokens AA lacks

  if (shared === 0) return -1;
  // An AA token missing from the OR id means a different model
  // ("mai-image-2.5-flash" must not degrade to "mai-image-2.5").
  if (aaMissing.some((t) => !IGNORABLE_MISSING.has(t))) return -1;

  if (aaMissing.length === 0 && orExtra === 0) return 100;
  return shared * 10 - aaMissing.length * 8 - orExtra * 4;
}

function creatorNorm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Is this OR org prefix compatible with the AA creator? */
export function creatorMatches(aaCreator: string, orPrefix: string): boolean {
  const aa = creatorNorm(aaCreator);
  const or = creatorNorm(orPrefix);
  if (!aa || !or) return false;
  if (aa === or || aa.includes(or) || or.includes(aa)) return true;
  return (CREATOR_ALIASES[aa] ?? []).some((alias) => creatorNorm(alias) === or);
}

export interface MatchCandidate {
  id: string;
  score: number;
}

// Tokenizing ~500 OR models per AA entry is wasteful when matching a whole
// benchmark table — cache per model object.
const orTokenCache = new WeakMap<ORModel, { prefix: string; idTokens: string[]; nameTokens: string[] }>();

function orTokens(m: ORModel) {
  let entry = orTokenCache.get(m);
  if (!entry) {
    const slash = m.id.indexOf("/");
    entry = {
      prefix: slash > 0 ? m.id.slice(0, slash) : "",
      idTokens: tokenize(m.id.slice(slash + 1)),
      nameTokens: tokenize(m.name),
    };
    orTokenCache.set(m, entry);
  }
  return entry;
}

interface AAIdentity {
  name: string;
  slug?: string;
  creatorName: string;
  creatorSlug?: string;
}

/** Find the best OR model for an AA model. Returns null when nothing clears
 *  the confidence bar — a wrong match is worse than no match. */
export function findORModelForAA(
  aa: AAIdentity,
  orModels: ORModel[],
  filter?: (m: ORModel) => boolean
): string | null {
  const variants = aaNameVariants(aa.name, aa.slug)
    .map((v) => stripEffortTokens(tokenize(v)))
    .filter((v) => v.length > 0);
  if (variants.length === 0) return null;

  const creators = [aa.creatorSlug, aa.creatorName].filter(Boolean) as string[];

  let best: MatchCandidate | null = null;
  for (const m of orModels) {
    if (m.id.startsWith("~") || m.id === "openrouter/auto") continue;
    if (filter && !filter(m)) continue;

    const { prefix, idTokens, nameTokens } = orTokens(m);
    if (!creators.some((c) => creatorMatches(c, prefix))) continue;

    let score = -1;
    for (const v of variants) {
      score = Math.max(score, scoreTokens(v, idTokens), scoreTokens(v, nameTokens) - 1);
    }
    if (score < 0) continue;
    // Prefer shorter ids on ties (base model over -preview/-pro variants).
    if (!best || score > best.score || (score === best.score && m.id.length < best.id.length)) {
      best = { id: m.id, score };
    }
  }

  return best && best.score >= 10 ? best.id : null;
}

export function findORModelForAALLM(aa: AAModel, orModels: ORModel[]): string | null {
  return findORModelForAA(
    {
      name: aa.name,
      slug: aa.slug,
      creatorName: aa.model_creator.name,
      creatorSlug: aa.model_creator.slug,
    },
    orModels
  );
}

export function findORModelForAAMedia(
  aa: AAMediaModel,
  orModels: ORModel[],
  filter?: (m: ORModel) => boolean
): string | null {
  return findORModelForAA(
    {
      name: aa.name,
      slug: aa.slug,
      creatorName: aa.model_creator.name,
      creatorSlug: aa.model_creator.slug,
    },
    orModels,
    filter
  );
}

// ── OR → AA direction ────────────────────────────────────────────────────────
//
// Used by `or models` / `or show` / `or compare` to attach benchmark scores to
// an OpenRouter listing. Many AA entries are effort variants of one model
// (gpt-5-5, gpt-5-5-high, gpt-5-5-low…); we prefer the shortest slug, which is
// AA's headline configuration.

export interface AABenchmarkIndex {
  /** Best AA entry for an OR model id, or undefined. */
  get(orId: string): AAModel | undefined;
}

export function buildAABenchmarkIndex(
  aaModels: AAModel[],
  orModels: ORModel[]
): AABenchmarkIndex {
  const byOrId = new Map<string, AAModel>();

  // Match every AA entry to an OR id, keeping the best-scoring / shortest-slug
  // AA entry per OR model.
  for (const aa of aaModels) {
    const orId = findORModelForAALLM(aa, orModels);
    if (!orId) continue;
    const existing = byOrId.get(orId);
    if (!existing || (aa.slug?.length ?? 99) < (existing.slug?.length ?? 99)) {
      byOrId.set(orId, aa);
    }
  }

  return { get: (orId: string) => byOrId.get(orId) };
}
