# or-cli

A CLI for [OpenRouter](https://openrouter.ai) — search models, send messages, view benchmarks, and more. Designed for both humans and AI agents.

## Installation

```bash
bun install -g .
```

Or run directly:
```bash
bun run src/cli.ts <command>
```

## Quick Start

```bash
# Set up your API keys
or auth --or-key sk-or-v1-...
or auth --aa-key aa_...  # Optional: for benchmark data

# Find cheap models with tool support
or models --tools --sort price -n 5

# Chat with a model
or chat "Explain monads" -m deepseek/deepseek-v4-flash

# Compare models side-by-side
or compare deepseek/deepseek-v4-flash openai/gpt-4o-mini

# View benchmarks
or benchmarks --type llm --sort coding -n 10
```

## Commands

| Command | Description |
|---------|-------------|
| `or auth` | Manage API keys (OpenRouter + Artificial Analysis) |
| `or models` | List, search, and filter 370+ models |
| `or show <id>` | Detailed model info with price ranges |
| `or compare <id> <id>` | Side-by-side model comparison |
| `or chat <message>` | Send messages to any model |
| `or endpoints <id>` | Per-provider uptime, latency, quantization |
| `or providers` | List providers with datacenter locations |
| `or benchmarks` | AA benchmark data (6 categories, 509+ models) |
| `or history` | View/search chat history |
| `or cache` | Manage response cache |

## Model Filtering

```bash
# By type
or models -t text|image|vision|embedding|audio|audio-gen|video|rerank|transcription

# By capability
or models --tools --reasoning --vision --free

# By parameters
or models --param structured_outputs tools

# By price/context
or models --max-cost 1 -c 128000

# By provider
or models -p deepseek

# Sort options
or models --sort price|context|name|created|usage|rank

# Special filters
or models --expiring        # Models going away soon
or models --tilde           # Include ~ prefix "latest" aliases
```

## Benchmarks

Powered by [Artificial Analysis](https://artificialanalysis.ai):

```bash
# LLM benchmarks (15 evaluations)
or benchmarks --type llm --sort coding -n 10
or benchmarks --type llm --detailed  # All 15 columns

# Media benchmarks (ELO ratings)
or benchmarks --type text-to-image
or benchmarks --type image-editing
or benchmarks --type text-to-speech
or benchmarks --type text-to-video
or benchmarks --type image-to-video

# Sort options: score, coding, intelligence, math, speed, ttft, price
or benchmarks --sort speed -n 5
```

## Reasoning

Control reasoning effort and view thinking output:

```bash
# Set reasoning effort (low, medium, high)
or chat "Solve this step by step" -m deepseek/deepseek-v4-flash --reasoning-effort high

# Show reasoning/thinking output
or chat "What is 15 * 23?" -m deepseek/deepseek-v4-flash --reasoning-effort high --show-reasoning

# System prompts
or chat "Explain monads" -s "You are a senior Haskell developer. Be concise."
```

## Agent-Friendly Features

- `--json` — Machine-readable JSON output
- `--md` — Markdown tables
- `--quiet` — Response text only (for piping)
- `--no-stream` — Wait for full response
- `--no-log` — Don't save to history
- `--no-cache` — Bypass cache, fetch fresh data
- Deterministic exit codes

## Provider Details

```bash
# See all providers for a model with uptime/latency
or endpoints deepseek/deepseek-v4-flash --sort uptime

# Filter by reliability
or endpoints deepseek/deepseek-v4-flash --min-uptime 99 --sort latency

# Filter by performance
or endpoints deepseek/deepseek-v4-flash --max-latency 1000 --min-throughput 50

# Provider datacenter info
or providers --region US
or providers --region EU
```

## History

All chats are automatically logged:

```bash
or history list                    # Recent chats
or history show <id>               # Full details
or history search "query"          # Search prompts/responses
or history stats                   # Usage statistics
or history clear                   # Clear history
```

## Caching

- OpenRouter models: 6h TTL (configurable)
- AA benchmarks: 24h TTL (respects 1000/day rate limit)
- Per-endpoint caching by query parameters

```bash
or cache --stats    # Show cache statistics
or cache --clear    # Clear all cached data
```

## API Keys

Get your keys:
- **OpenRouter**: https://openrouter.ai/keys
- **Artificial Analysis**: https://artificialanalysis.ai/login

```bash
# Interactive setup
or auth

# Direct setup
or auth --or-key sk-or-v1-...
or auth --aa-key aa_...

# Environment variables also work
export OPENROUTER_API_KEY=sk-or-v1-...
export ARTIFICIAL_ANALYSIS_API_KEY=aa_...
```

## Skills for AI Agents

Install the companion skills files for your coding agent:

```
skills/
├── or-models.md        # Model discovery
├── or-chat.md          # Chat + history
├── or-image-gen.md     # Image generation
└── or-benchmarks.md    # Benchmark queries
```

No hardcoded model names — everything is live-queried.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Language**: TypeScript
- **CLI Framework**: [Commander.js](https://github.com/tj/commander.js)
- **APIs**: OpenRouter, Artificial Analysis

## License

MIT
