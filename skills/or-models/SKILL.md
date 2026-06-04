---
name: or-models
description: Browse, search, filter, and compare AI models on OpenRouter. Use when the user asks about available models, wants to find a model for a task, needs pricing info, wants to compare options, asks "which model should I use", needs to check model capabilities, or wants provider/uptime info. Also use when you need to find a model for a specific modality: text, image generation, image understanding (vision), embeddings, audio, video, reranking, or transcription.
---

# Model Discovery with `or`

You have the `or` CLI tool for querying OpenRouter in real-time. **Never hardcode or guess model names** — always query live data. The model landscape changes constantly.

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
| `--benchmarks` | Include Artificial Analysis benchmark scores |
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
| Audio input | `-t audio` | Audio in (transcription, etc.) |
| Audio generation | `-t audio-gen` | Text in, audio out (TTS) |
| Video understanding | `-t video` | Video in, text out |
| Reranking | `-t rerank` | Documents in, ranked out |

## Output Formats

```bash
or models --json                   # Machine-readable JSON
or models --md                     # Markdown table
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

## Important Notes

- **Free models may have aggressive rate limits.** Always be prepared to fall back to a paid model.
- **Model IDs include the provider prefix** — e.g. `deepseek/deepseek-v4-flash`, not just `deepseek-v4-flash`.
- **Prices shown are "from" prices** — the cheapest provider. Use `or show` for price ranges.
- **Some models aren't in the main list** (image gen, video, rerank, transcription). Use `or show <id>` to find them.
- **`~` prefix models** (e.g. `~anthropic/claude-sonnet-latest`) are aliases that auto-resolve to the latest version.
