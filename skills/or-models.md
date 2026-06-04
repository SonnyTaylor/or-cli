---
name: or-models
description: Browse, search, filter, and compare AI models on OpenRouter using the `or` CLI. Use when the user asks about available models, wants to find a model for a task, needs pricing info, or wants to compare options.
---

# Model Discovery with `or`

You have the `or` CLI tool for querying OpenRouter in real-time. Never hardcode or guess model names — always query live data. The model landscape changes constantly.

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

## Output Formats

```bash
or models --json                   # Machine-readable JSON
or models --md                     # Markdown table
```

## Price Display

**Prices shown in `or models` are "from" prices** — the cheapest provider. Actual prices vary by provider. Use `or show <model-id>` to see the full price range across providers, or `or endpoints <model-id>` for per-provider pricing.

## Provider-Level Details

```bash
# See all providers, uptime, latency, quantization for a model
or endpoints <model-id>
or endpoints <model-id> --sort latency
or endpoints <model-id> --min-uptime 99
or endpoints <model-id> --quantization fp8
or endpoints <model-id> --caching

# List all providers and their datacenter locations
or providers
or providers --region US
or providers --region EU
```

## Important Notes

- **Free models may have aggressive rate limits** from their providers. Always be prepared to fall back to a paid model.
- **Model IDs include the provider prefix** — e.g. `deepseek/deepseek-v4-flash`, not just `deepseek-v4-flash`.
- **Prices vary by provider.** Use `or show` for price ranges, `or endpoints` for per-provider detail.
- **Context windows vary** — always verify with `or show`.
- **Modality types**: Use `-t` to filter. `image` = image generation (output includes image), `vision` = image understanding (accepts image input, outputs text).
- **Edge cases exist**: Some models have unique capabilities not captured by standard categories. Read descriptions with `or show`.
- **`~` prefix models** (e.g. `~anthropic/claude-sonnet-latest`) are aliases that auto-resolve to the latest version. Filtered out by default; use `--tilde` to include.
- **Expiring models**: Some models have expiration dates. Use `--expiring` to find them, or `or show` to see the date.
- **Models not in `/models` list**: Some models (image gen, video, rerank, transcription) are only accessible via `or show <id>` — they'll be fetched from the endpoints API.

## Examples

```bash
# Find cheap models with tool support
or models --tools --sort price -n 5

# Find vision models from a specific provider
or models --vision -p google

# Find models with structured output support
or models --param structured_outputs -n 10

# Compare three candidate models
or compare deepseek/deepseek-v4-flash qwen/qwen3-coder google/gemini-2.5-flash

# Get benchmark data for decision-making
or models "coding" --benchmarks --sort price -n 10

# Find the most reliable provider for a model
or endpoints deepseek/deepseek-v4-flash --min-uptime 99.5 --sort latency
```
