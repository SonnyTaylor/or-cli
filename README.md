# or-cli

A CLI for [OpenRouter](https://openrouter.ai) — search models, send messages, view benchmarks, and more. Designed for both humans and AI agents.

## Installation

```bash
# Clone the repo
git clone https://github.com/SonnyTaylor/or-cli.git
cd or-cli

# Install dependencies
bun install

# Install globally (makes `or` command available everywhere)
bun install -g .
```

After global install, run `or` from anywhere:

```bash
or --help
or models --tools --sort price -n 5
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
| `or chat <message>` | Send messages to any model (supports images, audio, video) |
| `or endpoints <id>` | Per-provider uptime, latency, quantization |
| `or providers` | List providers with datacenter locations |
| `or benchmarks` | AA benchmark data (6 categories, 509+ models) |
| `or rankings` | Daily token usage rankings for top models |
| `or credits` | Show account credits and usage |
| `or history` | View/search chat history |
| `or cache` | Manage response cache |

## Skills for AI Agents

Install companion skills for your coding agent:

```bash
# From the project root
npx skills add . -g -y
```

This installs 5 skills to `~/.agents/skills/` and symlinks them to your agent's skills directory:

| Skill | When it activates |
|-------|-------------------|
| `or-models` | Finding, comparing, filtering models |
| `or-chat` | Sending messages, getting completions |
| `or-multimodal` | Analyzing images, transcribing audio, summarizing video |
| `or-benchmarks` | Querying quality benchmarks, ELO ratings |
| `or-image-gen` | Image generation, editing, and understanding |

**No hardcoded model names** — everything is live-queried.

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

## Multimodal Inputs

Send images, audio, and video to compatible models:

```bash
# Image analysis
or chat "What's in this image?" --image photo.jpg -m google/gemini-2.5-flash

# Audio transcription
or chat "Transcribe this" --audio recording.wav -m google/gemini-2.5-flash

# Video summarization
or chat "Summarize this video" --video clip.mp4 -m google/gemini-2.5-flash
```

## Reasoning

Control reasoning effort and view thinking output:

```bash
or chat "Solve this" -m deepseek/deepseek-v4-flash --reasoning-effort high --show-reasoning
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
```

## Agent-Friendly Features

- `--json` — Machine-readable JSON output
- `--md` — Markdown tables
- `--quiet` — Response text only (for piping)
- `--no-stream` — Wait for full response
- `--no-log` — Don't save to history
- `--no-cache` — Bypass cache, fetch fresh data
- Deterministic exit codes

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

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Language**: TypeScript
- **CLI Framework**: [Commander.js](https://github.com/tj/commander.js)
- **APIs**: OpenRouter, Artificial Analysis

## License

MIT
