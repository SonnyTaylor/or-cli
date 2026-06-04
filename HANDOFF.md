# or-cli — Session Handoff

## Project Status

**Repo:** https://github.com/SonnyTaylor/or-cli (public)
**Location:** `C:/Users/Sonny Taylor/Code/openrouter-cli`
**CLI installed globally:** `or` command works from anywhere (via `npm install -g .`)

## What's Built

13 commands, 28 source files, 5 skills files.

### Commands

| Command | Status | Notes |
|---------|--------|-------|
| `or auth` | ✅ Done | API key management (interactive + flags) |
| `or models` | ✅ Done | 370+ models, 30+ filter flags |
| `or show` | ✅ Done | Price ranges, endpoint fallback for hidden models |
| `or compare` | ✅ Done | Side-by-side with benchmarks |
| `or chat` | ✅ Done | Multimodal (image/audio/video), reasoning |
| `or endpoints` | ✅ Done | Per-provider uptime/latency/quantization |
| `or providers` | ✅ Done | Datacenter locations |
| `or benchmarks` | ✅ Done | 15 LLM evals + 6 media categories |
| `or rankings` | ✅ Done | Daily token usage (top 50 models) |
| `or credits` | ✅ Done | Account balance with progress bar |
| `or history` | ✅ Done | Auto-logged, searchable |
| `or cache` | ✅ Done | Stats + clear |

### Skills (NEEDS WORK)

Currently 5 separate skill folders:
```
skills/
├── or-benchmarks/SKILL.md
├── or-chat/SKILL.md
├── or-image-gen/SKILL.md
├── or-models/SKILL.md
└── or-multimodal/SKILL.md
```

**Problem:** `npx skills add . -g -y` only detects 3 of 5 skills (or-benchmarks, or-image-gen, or-multimodal). or-models and or-chat are not detected. Unknown why — frontmatter is valid.

**User's suggestion:** Consolidate into 1 skill (`or-cli`) with a `references/` subfolder, like the context7-cli skill does:
```
skills/or-cli/
├── SKILL.md              # Main overview, quick reference
└── references/
    ├── models.md         # Model discovery, filtering
    ├── chat.md           # Chat, multimodal, reasoning
    ├── benchmarks.md     # AA benchmarks
    └── image-gen.md      # Image generation/editing/vision
```

Context7-cli skill structure for reference: `C:\Users\Sonny Taylor\.agents\skills\context7-cli\`

## Key Design Decisions

1. **No hardcoded model names** — everything is live-queried from APIs
2. **Prices show ranges** — min/max/avg across providers (not just cheapest)
3. **Agent-first** — `--json`, `--quiet`, `--no-stream`, `--no-log`
4. **AA caching** — 24h TTL, respects 1000/day rate limit
5. **Hidden models** — some models (recraft, whisper, rerank) aren't in `/models` list but work via `or show` fallback to endpoints API

## API Endpoints Used

### OpenRouter
- `GET /api/v1/models` — 344 models (text, vision, image, audio)
- `GET /api/v1/embeddings/models` — 26 embedding models
- `GET /api/v1/models/:id/endpoints` — per-provider details
- `GET /api/v1/providers` — provider list with datacenters
- `POST /api/v1/chat/completions` — chat (text, image, audio, video)
- `GET /api/v1/credits` — account balance
- `GET /api/v1/datasets/rankings-daily` — daily token usage

### Artificial Analysis (rate limited: 1000/day)
- `GET /api/v2/data/llms/models` — 530 models, 15 benchmarks
- `GET /api/v2/data/media/text-to-image` — 142 models (ELO)
- `GET /api/v2/data/media/image-editing` — 64 models
- `GET /api/v2/data/media/text-to-speech` — 84 models
- `GET /api/v2/data/media/text-to-video` — 83 models
- `GET /api/v2/data/media/image-to-video` — 76 models

## Known Issues / TODO

1. **Skills consolidation** — merge 5 skills into 1 with references/
2. **`npx skills` detection** — or-models and or-chat not detected (unknown why)
3. **Image generation test** — never actually tested generating an image end-to-end
4. **`or models --sort usage/rank`** — passes to API but doesn't seem to change order
5. **History deduplication** — same prompt sent twice creates two entries

## API Keys (for testing)

- OpenRouter: `REMOVED`
- Artificial Analysis: `aa_keEYLmoRXClDTNSZepwSfoSrgMSNjDRt`

## Tech Stack

- Runtime: Bun
- Language: TypeScript
- CLI: Commander.js
- Package manager: pnpm (project), npm (global install)
- Skills: `npx skills add . -g -y`

## File Structure

```
or-cli/
├── bin/or.ts                 # Entry point
├── src/
│   ├── cli.ts                # Registers all 13 commands
│   ├── commands/             # One file per command
│   └── lib/
│       ├── types.ts          # TypeScript types
│       ├── config.ts         # ~/.or-cli/config.json
│       ├── cache.ts          # File-based cache
│       ├── format.ts         # Output formatting
│       ├── openrouter.ts     # OR API client
│       ├── artificial-analysis.ts  # AA API client
│       └── history.ts        # JSONL history
├── skills/                   # 5 skill folders (needs consolidation)
├── package.json
├── tsconfig.json
└── README.md
```
