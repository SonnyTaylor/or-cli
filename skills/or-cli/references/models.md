# Model Discovery with `or`

## Core Workflow

**Never pick a model from memory — your training data is stale.** Models are released
weekly; the model you remember as "best" has usually been superseded. Always discover:

```bash
# 1. See what's actually being used right now (default sort = live popularity,
#    with Intel/Coding benchmark scores and release dates inline)
or models -n 20
or models "coding"                 # Search by keyword
or models -t text -n 20            # Filter by type

# 2. Narrow down
or models --tools --sort intelligence -n 10   # Smartest tool-capable models
or models --reasoning -n 10                   # Top reasoning models
or models --max-cost 1 -c 128000              # Under $1/M with 128K+ context
or models --new                               # Released in the last 30 days

# 3. Inspect a candidate
or show <model-id>                 # Full details, pricing, benchmarks
or compare id1 id2 id3             # Side-by-side
```

The default listing is sorted by **live weekly usage** and shows **benchmark scores**
(when an AA key is set) and **release dates** — trust that over what you remember.

## Critical: Read the Description

**Always run `or show <model-id>` before using a model.** The name and modality tag are NOT enough.

```bash
or show hexgrad/kokoro-82m
or show google/lyria-3-pro-preview
or show mistralai/voxtral-small-24b-2507
```

Common traps:
- `google/lyria-3-pro-preview` — generates **music/songs**, not speech
- `mistralai/voxtral-small-24b-2507` — **speech-to-text** (listens to audio), not text-to-speech
- `openai/gpt-audio-mini` — **chat completions** with audio, not the dedicated TTS endpoint

**The description is the only reliable way to know what a model actually does.**

## Filtering Flags

| Flag | What it does |
|------|-------------|
| `-t, --type <type>` | Filter: `text`, `image`, `vision`, `embedding`, `audio`, `audio-gen`, `speech`, `video`, `rerank`, `transcription` |
| `--tools` | Only models supporting tool/function calling |
| `--reasoning` | Only reasoning models |
| `--vision` | Only vision (image-input) models |
| `-f, --free` | Only free models |
| `--max-cost <n>` | Max combined price per 1M tokens |
| `-c, --min-context <n>` | Minimum context window |
| `-p, --provider <name>` | Filter by provider name prefix in model ID |
| `--param <param...>` | Filter by supported parameter (e.g. `tools`, `reasoning`, `response_format`, `structured_outputs`) |
| `-s, --sort <field>` | Sort by: `popular` (default), `newest`, `price`, `context`, `name`, `intelligence`, `coding` |
| `-n, --limit <n>` | Max results |
| `--no-benchmarks` | Hide the AA benchmark columns (shown automatically when an AA key is set) |
| `--new` | Only models added in the last 30 days |
| `--expiring` | Only models with an expiration date (going away soon) |
| `--tilde` | Include `~` prefix 'latest' alias models |

## Modality Types

Use `-t` to filter by what you need:

| Need | Filter | What it means |
|------|--------|---------------|
| Text generation | `-t text` | Text in, text out |
| Image generation | `-t image` | Text/image in, image out |
| Image understanding | `--vision` | Image in, text out |
| Embeddings | `-t embedding` | Text in, vector out |
| Audio input (STT) | `-t audio` | Models with audio input (check description) |
| Audio generation (TTS) | `-t speech` / `or tts --list-models` | Dedicated TTS models |
| Video understanding | `-t video` | Video in, text out |
| Reranking | `-t rerank` | Documents in, ranked out |

**Important:** `-t audio` is ambiguous — it matches ANY model with audio capabilities (STT input, TTS output, music generation, audio understanding). Always read the description. For dedicated TTS models, use `-t speech` or `or tts --list-models`.

## Output Formats

```bash
or models --json                   # Machine-readable JSON
or models --md                     # Markdown table
or models                          # Styled terminal table (default)
```

## Sorting

```bash
or models                          # Most-used this week (default)
or models -s intelligence          # Smartest first (API-side benchmark rank)
or models -s coding                # Best coders first
or models -s newest                # Newest first
or models -s price                 # Cheapest first
or models -s context               # Largest context first
or models -s name                  # Alphabetical
```

## Provider-Level Details

```bash
# See all providers, uptime, latency, quantization for a model
or endpoints <model-id>
or endpoints <model-id> --sort latency
or endpoints <model-id> --min-uptime 99

# List all providers and their datacenter locations
or providers
or providers --region US
```

## Comparing Models

```bash
or compare deepseek/deepseek-v4-pro xiaomi/mimo-v2.5-pro       # Side-by-side (AA scores automatic)
or compare model1 model2 --cost-estimate                        # With cost per session
```

The `--cost-estimate` flag shows estimated cost for a typical coding session (100K input / 50K output) and a larger session (500K input / 100K output).

## Free Models

```bash
or models -f                        # All free models
or models -f -t text                # Free text models
or models "coding" -f --tools       # Free coding models with tools
```

Free models have aggressive rate limits. Be prepared to fall back to a paid model.

## Recently Added Models

```bash
or models --new                     # Models added in last 30 days
or models --new -t text             # New text models
or models --new -s created          # Newest first
```

## Model Usage / Popularity

```bash
or rankings                         # Daily token usage for top models
or rankings --model deepseek        # Filter by model name
or rankings --date 2025-01-15       # Specific date
or rankings -n 50                   # Top 50 models
```

The `rankings` command shows real usage data from OpenRouter — how many tokens each model consumed per day. This is the best proxy for "user sentiment" / popularity.

## Important Notes

- **Always read the description:** `or show <model-id>` before using. Names are misleading.
- **Free models may have aggressive rate limits.** Always be prepared to fall back to a paid model.
- **Model IDs include the provider prefix** — e.g. `deepseek/deepseek-v4-flash`, not just `deepseek-v4-flash`.
- **Prices shown are "from" prices** — the cheapest provider. Use `or show` for price ranges.
- **All model types are fetched** (text, image, video, speech, audio, transcription, embeddings). Use `-t` to filter specific modalities.
- **`~` prefix models** (e.g. `~anthropic/claude-sonnet-latest`) are aliases that auto-resolve to the latest version.
- **`--json` for piping** — all commands support `--json` for machine-readable output.
- **`--quiet` for minimal output** — suppresses non-essential output, returns only the core result.
