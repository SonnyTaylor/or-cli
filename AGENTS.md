# AGENTS.md

Instructions for AI agents working on `or-cli`.

## What This Is

A CLI tool for the full OpenRouter API surface — chat, image/video/audio generation, embeddings, transcription, reranking, and model discovery — plus Artificial Analysis benchmarks. All from the terminal.

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
│   │   ├── ask.ts            # One-shot Q&A (no conversation)
│   │   ├── auth.ts           # API key management
│   │   ├── benchmarks.ts     # AA benchmark queries
│   │   ├── cache.ts          # Cache stats + clear
│   │   ├── chat.ts           # Multi-turn conversations
│   │   ├── compare.ts        # Side-by-side model comparison
│   │   ├── config.ts         # View/set per-modality default models
│   │   ├── conversations.ts  # Conversation management (list, view, delete)
│   │   ├── cost.ts           # Spending breakdown from history
│   │   ├── create.ts         # Generation: image, video, audio (subcommands)
│   │   ├── credits.ts        # Account balance
│   │   ├── doctor.ts         # Config + connectivity diagnostics
│   │   ├── embed.ts          # Text/multimodal embeddings
│   │   ├── endpoints.ts      # Per-provider details
│   │   ├── history.ts        # Chat history (JSONL)
│   │   ├── models.ts         # Model search/filter/list (--new flag)
│   │   ├── providers.ts      # Provider datacenter info
│   │   ├── rankings.ts       # Daily token usage
│   │   ├── rerank.ts         # Document reranking
│   │   ├── show.ts           # Single model details
│   │   ├── transcribe.ts     # Speech-to-text (audio transcription)
│   │   └── version.ts        # Version + environment info
│   └── lib/
│       ├── artificial-analysis.ts  # AA API client
│       ├── cache.ts                # File-based cache (~/.or-cli/cache/)
│       ├── chat-core.ts            # Shared: message building, streaming, history, stats
│       ├── config.ts               # Config (~/.or-cli/config.json)
│       ├── conversations.ts        # Conversation persistence (JSONL per thread)
│       ├── fetch.ts                # fetch wrapper with TLS error handling
│       ├── format.ts               # Output formatting helpers
│       ├── history.ts              # JSONL history logging
│       ├── model-match.ts          # AA↔OpenRouter model matching (token-based, creator-aware)
│       ├── openrouter.ts           # OR API client + model helpers
│       ├── pricing-fallbacks.ts    # Hardcoded pricing for models the API under-reports
│       └── types.ts                # TypeScript interfaces
├── skills/                   # AI agent skill (installed via npx skills)
│   └── or-cli/
│       ├── SKILL.md          # Main skill file
│       └── references/       # Detailed docs per topic
├── UX_OVERHAUL.md            # Design spec for the v0.5.0 UX redesign
├── package.json
└── tsconfig.json
```

## Versioning

We use semver. Current: **v0.6.0**

**Bump the version in both places when releasing:**
1. `package.json` → `"version": "0.6.0"`
2. `src/cli.ts` → `.version("0.6.0")`

The `or version` command reads from `package.json` at runtime.

**Version bump guidelines:**
- Patch (0.5.x): Bug fixes, small tweaks
- Minor (0.x.0): New commands, new flags, new API integrations
- Major (x.0.0): Breaking changes to CLI interface or output format

## Command Architecture

Commands are organized by **user intent**, not by API endpoint:

### Analysis & Conversation
| Command | Purpose |
|---------|---------|
| `or ask` | One-shot Q&A (no persistence). Supports `--image`, `--audio`, `--video`, `--pdf` |
| `or chat` | Multi-turn conversations. `--conversation`, `--continue`, `--resume` |

### Generation
| Command | Purpose |
|---------|---------|
| `or create image` | Image generation + editing (`--image` inputs, `--save`, `--aspect-ratio`, `--style`) |
| `or create video` | Video generation (async: submits job, polls, downloads). `--resolution`, `--duration`, `--frame-image` |
| `or create audio` | TTS (`--voice`, `--format`, `--speed`, `--list-models`, `--list-voices`) |

### Processing
| Command | Purpose |
|---------|---------|
| `or embed` | Text/multimodal embeddings (`--dimensions`, `--image`, `--batch`, `--list-models`) |
| `or transcribe` | Speech-to-text (`--language`, `--temperature`, `--output`) |
| `or rerank` | Document reranking (`--top-n`, `--file`) |

### Discovery
| Command | Purpose |
|---------|---------|
| `or models` | Search/filter/list models |
| `or show` | Single model details |
| `or compare` | Side-by-side model comparison |
| `or benchmarks` | AA benchmark queries |
| `or rankings` | Daily token usage |
| `or providers` | Provider datacenters |
| `or endpoints` | Per-provider pricing/uptime |

### System & Account
| Command | Purpose |
|---------|---------|
| `or auth` | API key management |
| `or config` | Default models, cache TTL, insecure mode |
| `or credits` | Account balance |
| `or cost` | Spending breakdown |
| `or history` | Chat history |
| `or cache` | Cache stats & clear |
| `or conversations` | Conversation management |
| `or doctor` | Connectivity diagnostics |
| `or version` | Version info |

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

3. **Benchmark model IDs ≠ OpenRouter IDs** — Artificial Analysis and OpenRouter name the same model differently (`claude-opus-4-8` vs `anthropic/claude-opus-4.8`; "Nano Banana 2 (Gemini 3.1 Flash Image Preview)" vs `google/gemini-3.1-flash-image-preview`). `src/lib/model-match.ts` handles this: token-based matching with hard constraints (numeric versions must agree exactly, creators must be compatible via an alias table, distinguishing tokens like "flash"/"mini" can't be dropped). `or benchmarks` shows matched OR IDs automatically; `or models`/`or show`/`or compare` attach AA scores via `buildAABenchmarkIndex`. AA benchmarks the same model at multiple reasoning efforts — several AA rows can map to one OR id (the index prefers the shortest AA slug).

4. **`/models/{id}/endpoints`** — Some models are hidden from `/models` but accessible via their endpoints. We use this for per-image pricing enrichment.

5. **Image output format** — When a model generates an image, it's in `response.choices[0].message.images[0].image_url.url` as a base64 data URI, NOT in the standard `content` array. The `--save` flag handles extraction automatically.

6. **Video generation is async** — Unlike text/image, video gen uses a dedicated `POST /api/v1/videos` endpoint. Submit → poll → download. The `or create video` command handles this automatically with a spinner.

7. **PDF support** — PDFs can be sent as local files (base64 encoded) or URLs. The `file` content type is used. Models that support files natively get the raw PDF; others get parsed text/images via Cloudflare AI or Mistral OCR.

8. **Server tools** — `--web-search`, `--web-fetch`, `--datetime` are model-decided tools. The model chooses when to call them. OpenRouter executes server-side and returns results. Costs: web search $0.005/request (Exa/Parallel), web fetch $0.001/fetch.

9. **`:exacto` variant** — Appending `:exacto` to a model ID routes to providers with stronger tool-calling quality signals. Costs may be higher than default routing.

10. **Server-side caching** — `--server-cache` enables OpenRouter's response caching. Cache hits are free (zero tokens charged). Identical requests (same model, messages, params) within TTL return cached responses.

### chat-core.ts

The `src/lib/chat-core.ts` module contains shared logic used by `ask`, `chat`, and `create`:

- `buildContentParts()` — Builds multimodal content parts from file paths
- `buildMessages()` — Builds the messages array with system prompt and history
- `buildRequest()` — Builds the API request body (tools, plugins, modalities)
- `handleStream()` / `handleNonStream()` — Streaming and non-streaming API handlers
- `saveImage()` — Extracts and saves base64 images from responses
- `logHistory()` / `printStats()` — History logging and stats output

When adding new commands that talk to the chat completions API, use chat-core instead of reimplementing.

### Caching

- **Location:** `~/.or-cli/cache/`
- **TTL:** 6 hours by default
- **AA data:** Cached for 24 hours (rate limit: 1000/day)
- **Clear:** `or cache clear`
- **Bypass:** `--no-cache` flag on any command

### Config

- **Location:** `~/.or-cli/config.json`
- **Keys:** `openrouterApiKey`, `artificialAnalysisApiKey`, `defaultModel`, `defaultModels`, `cacheTtlMs`
- **Env vars override:** `OPENROUTER_API_KEY`, `ARTIFICIAL_ANALYSIS_API_KEY`

**Per-modality defaults:**
```bash
or config --set-image google/gemini-2.5-flash-image  # Default for image gen
or config --set-vision google/gemini-2.5-flash       # Default when --image used
or config --set-text deepseek/deepseek-v4-flash      # Default for text prompts
or config --set-video google/veo-3.1                 # Default for video gen
or config --set-audio hexgrad/kokoro-82m             # Default for TTS
or config --clear image                               # Clear a default
or config --show                                      # View all config
```

When `or ask` or `or chat` is called without `-m`, it picks the default based on input:
- `--image` flag → uses `vision` default
- `--audio` flag → uses `audio` default
- `--video` flag → uses `video` default
- Otherwise → uses `text` default
- Falls back to `defaultModel` (global), then `openai/gpt-4o-mini`

### Output Formats

Most commands support:
- `--json` — Machine-readable JSON
- `--md` — Markdown table (where applicable)
- `--quiet` — Suppress non-essential output, return only the core result
- Default — Styled terminal table with chalk colors

`or ask` and `or chat` additionally support:
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

Conversations are stored separately in `~/.or-cli/conversations/` as individual JSONL files.

## Common Tasks

### Adding a New Command

1. Create `src/commands/my-command.ts`
2. Export a function that returns a `Command`
3. Import and register in `src/cli.ts`
4. Add types to `src/lib/types.ts` if needed
5. Bump minor version in `package.json` + `src/cli.ts`

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
| `GET /models?output_modalities=video` | Video generation models |
| `GET /models?output_modalities=speech` | TTS models |
| `GET /embeddings/models` | Embedding models |
| `GET /models/{id}/endpoints` | Per-provider pricing/uptime |
| `GET /providers` | Provider list with datacenters |
| `POST /chat/completions` | Chat/inference (text, vision, image gen) |
| `POST /audio/speech` | Text-to-speech |
| `POST /audio/transcriptions` | Speech-to-text |
| `POST /embeddings` | Generate embeddings |
| `POST /rerank` | Document reranking |
| `POST /videos` | Submit video generation job (async) |
| `GET /videos/{jobId}` | Poll video job status |
| `GET /videos/{jobId}/content` | Download generated video |
| `GET /videos/models` | List video generation models |
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
or show google/gemini-2.5-flash
or benchmarks --type llm -n 3
or cost
or credits
or history list
or cache stats
or conversations list

# Generation (v0.5.0)
or ask "What's 2+2?"
or ask --help | grep -E '(image|audio|video|pdf)'
or create image --help
or create video --help
or create audio --help

# Processing (v0.5.0)
or embed "Hello world" --dimensions 64
or embed --list-models
or transcribe --help
or rerank "query" "doc1" "doc2"

# Chat features
or chat --help | grep -E '(conversation|continue|resume)'
```

## PR/Commit Conventions

- Commit messages: lowercase, describe what changed
- Bump version in `package.json` + `src/cli.ts` for feature additions
- Run `npx skills add . -g -y` after skill changes
- Don't commit `node_modules/`, `bun.lock`, cache files, or API keys
