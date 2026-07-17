# or-cli

A CLI for [OpenRouter](https://openrouter.ai) — the full API surface from the terminal. Chat, generate images/video/audio, embed text, transcribe speech, rerank documents, and discover models. Designed for both humans and AI agents.

## Installation

```bash
git clone https://github.com/SonnyTaylor/or-cli.git
cd or-cli
bun install
bun install -g .
```

## Quick Start

```bash
# Set up API keys
or auth --or-key sk-or-v1-...

# Ask a question
or ask "Explain monads" -m deepseek/deepseek-v4-flash

# Generate an image
or create image "A mountain logo" --save logo.png

# Edit an image (image-to-image)
or create image "Make the sky purple" --image photo.jpg --save edited.png

# Transcribe audio
or transcribe recording.mp3

# Find models — sorted by live popularity, with benchmark scores inline
or models -n 20
or models --tools --sort intelligence -n 5
```

## Commands

### Analysis & Conversation
| Command | Description |
|---------|-------------|
| `or ask` | One-shot Q&A with multimodal inputs (image, audio, video, PDF) |
| `or chat` | Multi-turn conversations with persistent context |

### Generation
| Command | Description |
|---------|-------------|
| `or create image` | Image generation and editing (`--image` for image-to-image) |
| `or create video` | Video generation (async — submits, polls, downloads) |
| `or create audio` | Text-to-speech with voice selection |

### Processing
| Command | Description |
|---------|-------------|
| `or embed` | Text/multimodal embeddings |
| `or transcribe` | Speech-to-text transcription |
| `or rerank` | Document reranking by relevance |

### Discovery
| Command | Description |
|---------|-------------|
| `or models` | Search/filter models — live popularity sort, benchmark scores, release dates |
| `or show` | Detailed model info with price ranges and benchmarks |
| `or compare` | Side-by-side model comparison (benchmarks automatic) |
| `or benchmarks` | AA benchmarks with OpenRouter IDs matched automatically |
| `or rankings` | Daily token usage rankings |
| `or providers` | Provider datacenter info |
| `or endpoints` | Per-provider uptime, latency, pricing |

### System & Account
| Command | Description |
|---------|-------------|
| `or auth` | API key management |
| `or config` | Default models, cache TTL, insecure mode |
| `or credits` | Account balance |
| `or cost` | Spending breakdown |
| `or history` | Chat history |
| `or conversations` | Conversation management |
| `or cache` | Cache stats and clear |
| `or doctor` | Connectivity diagnostics |
| `or version` | Version and environment info |

## Agent-Friendly Features

Every command supports:
- `--json` — Machine-readable JSON output
- `--quiet` — Suppress non-essential output
- `--no-cache` — Bypass cache, fetch fresh data

Additional flags on `or ask` / `or chat`:
- `--no-stream` — Wait for full response (default for non-TTY)
- `--no-log` — Don't save to history
- `--exacto` — Quality-first provider routing
- `--server-cache` — Free cached responses
- `--heal` — Auto-fix malformed JSON

## Skills for AI Agents

```bash
npx skills add . -g -y
```

Installs a single consolidated `or-cli` skill with references for all commands.

## Tech Stack

- **Runtime:** [Bun](https://bun.sh)
- **Language:** TypeScript
- **CLI Framework:** [Commander.js](https://github.com/tj/commander.js)
- **APIs:** OpenRouter, Artificial Analysis

## License

MIT
