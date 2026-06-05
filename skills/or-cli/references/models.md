# Model Discovery with `or`

## Core Workflow

**Always start broad, then narrow.** Don't assume a model exists or is the best choice.

```bash
# 1. See what's available
or models                          # List all models
or models "coding"                 # Search by keyword
or models -t text                  # Filter by type

# 2. Narrow down
or models --tools --sort price     # Tool-capable, cheapest first
or models --reasoning -n 10        # Top 10 reasoning models
or models --max-cost 1 -c 128000   # Under $1/M with 128K+ context

# 3. Inspect a candidate
or show <model-id>                 # Full details with price ranges
or compare id1 id2 id3             # Side-by-side
```

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
| `-t, --type <type>` | Filter: `text`, `image`, `vision`, `embedding`, `audio`, `audio-gen`, `video`, `rerank`, `transcription` |
| `--tools` | Only models supporting tool/function calling |
| `--reasoning` | Only reasoning models |
| `--vision` | Only vision (image-input) models |
| `-f, --free` | Only free models |
| `--max-cost <n>` | Max combined price per 1M tokens |
| `-c, --min-context <n>` | Minimum context window |
| `-p, --provider <name>` | Filter by provider name prefix in model ID |
| `--param <param...>` | Filter by supported parameter (e.g. `tools`, `reasoning`, `response_format`, `structured_outputs`) |
| `-s, --sort <field>` | Sort by: `price`, `context`, `name`, `created`, `usage`, `rank` |
| `-n, --limit <n>` | Max results |
| `--benchmarks` | Include Artificial Analysis benchmark scores (requires AA API key) |
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
| Audio generation (TTS) | `or tts --list-models` | Dedicated TTS models |
| Video understanding | `-t video` | Video in, text out |
| Reranking | `-t rerank` | Documents in, ranked out |

**Important:** `-t audio` is ambiguous — it matches ANY model with audio capabilities (STT input, TTS output, music generation, audio understanding). Always read the description. For dedicated TTS models, use `or tts --list-models`.

## Output Formats

```bash
or models --json                   # Machine-readable JSON
or models --md                     # Markdown table
or models                          # Styled terminal table (default)
```

## Sorting

```bash
or models -s price                 # Cheapest first (default: name)
or models -s context               # Largest context first
or models -s created               # Newest first
or models -s usage                 # Most used (from API)
or models -s rank                  # Best ranked (from API)
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
or compare deepseek/deepseek-v4-pro xiaomi/mimo-v2.5-pro       # Side-by-side
or compare model1 model2 --benchmarks                           # With AA scores
or compare model1 model2 --cost-estimate                        # With cost per session
or compare model1 model2 --benchmarks --cost-estimate           # Full comparison
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
- **Some models aren't in the main list** (image gen, video, rerank, transcription). Use `or show <id>` to find them.
- **`~` prefix models** (e.g. `~anthropic/claude-sonnet-latest`) are aliases that auto-resolve to the latest version.
- **`--quiet` is only supported on `or chat`** — use `--json` on other commands for piping.
