# AGENTS.md

Instructions for AI agents working on `or-cli`.

## What This Is

A CLI tool for querying OpenRouter (AI model marketplace) and Artificial Analysis (independent benchmarks). Lets users search models, send chat messages, view benchmarks, compare models, and generate images — all from the terminal.

**Runtime:** Bun (not Node.js — this matters, see Gotchas)  
**Language:** TypeScript (ESM, `"type": "module"`)  
**CLI framework:** Commander.js  
**Global install:** `npm install -g .` → `or` command available everywhere

## Quick Start

```bash
# Dev mode (runs src/cli.ts directly)
bun run dev

# Run as if installed globally
bun run bin/or.ts <command>

# After npm install -g .
or <command>
```

## File Structure

```
or-cli/
├── bin/or.ts                 # Entry point (just imports src/cli.ts)
├── src/
│   ├── cli.ts                # Registers all commands with Commander
│   ├── commands/             # One file per command
│   │   ├── auth.ts           # API key management
│   │   ├── benchmarks.ts     # AA benchmark queries
│   │   ├── cache.ts          # Cache stats + clear
│   │   ├── chat.ts           # Send messages, --save for images
│   │   ├── compare.ts        # Side-by-side model comparison
│   │   ├── cost.ts           # Spending breakdown from history
│   │   ├── credits.ts        # Account balance
│   │   ├── doctor.ts         # Config + connectivity diagnostics
│   │   ├── endpoints.ts      # Per-provider details
│   │   ├── history.ts        # Chat history (JSONL)
│   │   ├── models.ts         # Model search/filter/list (--new flag)
│   │   ├── providers.ts      # Provider datacenter info
│   │   ├── rankings.ts       # Daily token usage
│   │   ├── show.ts           # Single model details
│   │   └── version.ts        # Version + environment info
│   └── lib/
│       ├── artificial-analysis.ts  # AA API client
│       ├── cache.ts                # File-based cache (~/.or-cli/cache/)
│       ├── config.ts               # Config (~/.or-cli/config.json)
│       ├── format.ts               # Output formatting helpers
│       ├── history.ts              # JSONL history logging
│       ├── openrouter.ts           # OR API client + model helpers
│       └── types.ts                # TypeScript interfaces
├── skills/                   # AI agent skill (installed via npx skills)
│   └── or-cli/
│       ├── SKILL.md          # Main skill file
│       └── references/       # Detailed docs per topic
├── package.json
└── tsconfig.json
```

## Versioning

We use semver. Current: **v0.2.0**

**Bump the version in both places when releasing:**
1. `package.json` → `"version": "0.2.0"`
2. `src/cli.ts` → `.version("0.2.0")`

The `or version` command reads from `package.json` at runtime.

**Version bump guidelines:**
- Patch (0.2.x): Bug fixes, small tweaks
- Minor (0.x.0): New commands, new flags, new API integrations
- Major (x.0.0): Breaking changes to CLI interface or output format

## Gotchas & Niche Stuff

### Bun ≠ Node.js

This project runs on **Bun**, not Node. Key differences that have bitten us:

1. **`mkdirSync` with `{ recursive: true }`** — Bun throws `EEXIST` if the directory already exists. Node.js doesn't. Always check `existsSync()` first:
   ```typescript
   // ❌ Bun throws if dir exists
   mkdirSync(dir, { recursive: true });
   
   // ✅ Safe
   if (!existsSync(dir)) {
     mkdirSync(dir, { recursive: true });
   }
   ```

2. **No `build` step** — Bun runs TypeScript directly. There's no `npm run build`. Don't look for compiled JS output.

3. **`bun run dev`** vs **`bun run bin/or.ts`** — `dev` runs `src/cli.ts` directly, `bin/or.ts` is the shebang entry point for global install.

### API Quirks

1. **`/models` doesn't return all models** — Per-image priced models (Recraft, FLUX, xAI, Sourceful) aren't in the default response. Use `?output_modalities=image` to get image models. We fetch both and merge.

2. **Per-image pricing** — Some models charge per image, not per token. Their `pricing.prompt` and `pricing.completion` are `"0"`, but `pricing.image` has the per-image-token price. The `isPerImagePriced()` and `getPerImagePrice()` helpers detect this.

3. **`--quiet` only works on `or chat`** — `or models`, `or show`, `or benchmarks` don't support `--quiet`. Using it there causes an `error: unknown option` that gets hidden by `2>/dev/null`, making it look like empty output.

4. **Benchmark model IDs ≠ OpenRouter IDs** — Artificial Analysis benchmarks show models from many providers. A model like `black-forest-labs/flux-2-max` in benchmarks might not exist on OpenRouter. Use `or benchmarks --or` to cross-reference, or `or models -t image` to find actual IDs.

5. **`/models/{id}/endpoints`** — Some models are hidden from `/models` but accessible via their endpoints. We use this for per-image pricing enrichment.

6. **Image output format** — When a model generates an image, it's in `response.choices[0].message.images[0].image_url.url` as a base64 data URI, NOT in the standard `content` array. The `--save` flag handles extraction automatically.

### Caching

- **Location:** `~/.or-cli/cache/`
- **TTL:** 6 hours by default
- **AA data:** Cached for 24 hours (rate limit: 1000/day)
- **Clear:** `or cache clear`
- **Bypass:** `--no-cache` flag on any command

### Config

- **Location:** `~/.or-cli/config.json`
- **Keys:** `openrouterApiKey`, `artificialAnalysisApiKey`, `defaultModel`, `cacheTtlMs`
- **Env vars override:** `OPENROUTER_API_KEY`, `ARTIFICIAL_ANALYSIS_API_KEY`

### Output Formats

Every command supports:
- `--json` — Machine-readable JSON
- `--md` — Markdown table
- Default — Styled terminal table with chalk colors

`or chat` additionally supports:
- `--quiet` — Only response text (for piping)
- `--no-stream` — Wait for full response (default for non-TTY)
- `--save <path>` — Save generated images to file

### Skills

The `skills/or-cli/` directory is an AI agent skill installed via `npx skills add . -g -y`. It symlinks to `~/.agents/skills/or-cli/` and `~/.pi/agent/skills/or-cli/`.

**When updating skills:**
1. Edit files in `skills/or-cli/`
2. Run `npx skills add . -g -y` to reinstall
3. Commit both the skill source and any other changes

**Skill structure:**
- `SKILL.md` — Main overview, quick reference, common mistakes
- `references/*.md` — Deep dives per topic (models, chat, benchmarks, image-gen, multimodal)

### History

Chat history is stored in `~/.or-cli/history.jsonl` (one JSON object per line). Each entry includes model, tokens, cost estimate, latency, and the full prompt/response.

## Common Tasks

### Adding a New Command

1. Create `src/commands/my-command.ts`
2. Export a function that returns a `Command`
3. Import and register in `src/cli.ts`
4. Add types to `src/lib/types.ts` if needed
5. Bump minor version

### Adding a New API

1. Add types to `src/lib/types.ts`
2. Create client in `src/lib/` (e.g., `my-api.ts`)
3. Use `getCached`/`setCache` from `src/lib/cache.ts` for caching
4. Use `orFetch` pattern from `openrouter.ts` for authenticated requests

### Debugging

```bash
# See raw JSON output
or models --json | head -20

# Check config
cat ~/.or-cli/config.json

# Check cache
ls ~/.or-cli/cache/

# Clear cache
or cache clear

# Test with fresh cache
or models --no-cache
```

## API Endpoints Used

### OpenRouter
| Endpoint | Used For |
|----------|----------|
| `GET /models` | Main model list (text, vision, etc.) |
| `GET /models?output_modalities=image` | Image generation models |
| `GET /embeddings/models` | Embedding models |
| `GET /models/{id}/endpoints` | Per-provider pricing/uptime |
| `GET /providers` | Provider list with datacenters |
| `POST /chat/completions` | Chat/inference |
| `GET /credits` | Account balance |
| `GET /datasets/rankings-daily` | Daily token usage |

### Artificial Analysis (rate limited: 1000/day)
| Endpoint | Used For |
|----------|----------|
| `GET /data/llms/models` | LLM benchmarks (15 evals) |
| `GET /data/media/{type}` | Media benchmarks (ELO ratings) |

Media types: `text-to-image`, `image-editing`, `text-to-speech`, `text-to-video`, `image-to-video`

## Dependencies

- **commander** — CLI framework
- **chalk** — Terminal colors
- **ora** — Spinners
- **cli-table3** — Table rendering
- **conf** — Config management (unused, we roll our own)
- **zod** — Schema validation (available but not heavily used yet)

## Testing

No formal test suite yet. Test manually:

```bash
# Smoke test all commands
or version
or doctor
or auth --show
or models -t text -n 3
or models -t image -n 3
or models --new -n 5
or show google/gemini-2.5-flash
or benchmarks --type llm -n 3
or benchmarks --type image-editing --or -n 3
or cost
or credits
or history list
or cache stats
```

## PR/Commit Conventions

- Commit messages: lowercase, describe what changed
- Bump version in `package.json` + `src/cli.ts` for feature additions
- Run `npx skills add . -g -y` after skill changes
- Don't commit `node_modules/`, `bun.lock`, cache files, or API keys
