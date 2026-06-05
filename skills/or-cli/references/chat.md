# Chat with `or`

Use `or chat` to send single-shot messages to any model on OpenRouter. Supports text, images, audio, video, and PDF inputs. Also supports server tools (web search, web fetch, datetime) and quality-first routing.

**`or chat` handles INPUTS only.** For generating outputs like images or speech, use the dedicated commands: [`or tts`](tts.md) for text-to-speech.

## Basic Usage

```bash
or chat "What is the capital of France?"
or chat "Explain monads" -m deepseek/deepseek-v4-flash
or chat "Write a haiku" -m xiaomi/mimo-v2.5 --max-tokens 100
```

## Flags

| Flag | Purpose |
|------|---------|
| `-m, --model <id>` | Model to use (find one with `or models`) |
| `-s, --system <prompt>` | System prompt |
| `--max-tokens <n>` | Cap response length |
| `--temperature <n>` | Creativity (0-2, default varies by model) |
| `--reasoning-effort <level>` | Reasoning effort: low, medium, high |
| `--show-reasoning` | Show reasoning/thinking output |
| `--image <path>` | Send an image file for analysis |
| `--audio <path>` | Send an audio file for transcription/understanding (STT) |
| `--video <path>` | Send a video file for analysis |
| `--pdf <path>` | Send a PDF file (local path or URL) |
| `--pdf-engine <engine>` | PDF engine: native, cloudflare-ai, mistral-ocr |
| `--web-search` | Enable web search server tool |
| `--web-search-engine <engine>` | Search engine: auto, exa, firecrawl, parallel |
| `--web-search-max <n>` | Max results per web search |
| `--web-fetch` | Enable web fetch server tool |
| `--datetime` | Enable datetime server tool |
| `--exacto` | Quality-first provider routing |
| `--server-cache` | Enable OpenRouter response caching (free cache hits) |
| `--server-cache-ttl <seconds>` | Cache TTL (1-86400 seconds) |
| `--heal` | Enable response healing plugin (auto-fix malformed JSON) |
| `--save <path>` | Save generated image to file (for image gen models) |
| `--json` | Full API response as JSON |
| `--quiet` | Only the response text (for piping) |
| `--stream` / `--no-stream` | Stream vs wait for full response |
| `--no-log` | Don't save to history |

## Multimodal Inputs

```bash
# Image analysis
or chat "What's in this image?" --image photo.jpg -m xiaomi/mimo-v2.5

# Audio transcription (STT — audio input, text output)
or chat "Transcribe this audio" --audio recording.wav -m xiaomi/mimo-v2.5

# Video summarization
or chat "Summarize this video" --video clip.mp4 -m xiaomi/mimo-v2.5

# PDF analysis (local file)
or chat "Summarize this document" --pdf report.pdf -m xiaomi/mimo-v2.5

# PDF analysis (URL)
or chat "What are the main points?" --pdf https://example.com/paper.pdf -m anthropic/claude-sonnet-4

# PDF with specific engine
or chat "Extract text" --pdf scanned.pdf --pdf-engine mistral-ocr -m xiaomi/mimo-v2.5
```

**Note:** `or chat` handles media INPUTS only. For generating audio output (TTS), use [`or tts`](tts.md).

## Server Tools

Server tools let the model call OpenRouter-operated tools during a request. The model decides when to use them.

```bash
# Web search — model can search the web for current info
or chat "What are the latest AI news?" --web-search -m openai/gpt-5.2

# Web search with specific engine
or chat "Find recent papers on transformers" --web-search --web-search-engine exa -m openai/gpt-5.2

# Web search with domain filtering (use --json to inspect results)
or chat "Latest from arxiv" --web-search -m openai/gpt-5.2 --json

# Web fetch — model can fetch content from URLs
or chat "Summarize this page" --web-fetch -m openai/gpt-5.2
# Then say: "Fetch https://example.com/article and summarize it"

# Datetime — model gets current date/time
or chat "What day is it?" --datetime -m openai/gpt-5.2

# Combine multiple server tools
or chat "What's happening in AI today?" --web-search --datetime -m openai/gpt-5.2
```

### How Server Tools Work

- The model decides **when** to call each tool based on your prompt
- OpenRouter executes the tool server-side and returns results to the model
- The model may call tools multiple times in a single request
- Server tools work alongside user-defined tools

### Web Search Options

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `--web-search-engine` | auto, exa, firecrawl, parallel | auto | Search engine to use |
| `--web-search-max` | 1-25 | 5 | Max results per search call |

## Exacto Variant

The `:exacto` suffix routes requests to providers with stronger tool-calling quality signals. Useful for agentic workflows where reliability matters more than cost.

```bash
# Quality-first routing
or chat "Draft a changelog" -m moonshotai/kimi-k2-0905:exacto

# Or use the --exacto flag
or chat "Draft a changelog" -m moonshotai/kimi-k2-0905 --exacto

# Show command shows when exacto is available
or show deepseek/deepseek-v4-flash
# → 💡 Tip: Use deepseek/deepseek-v4-flash:exacto for quality-first provider routing
```

## Server-Side Response Caching

OpenRouter caches identical requests. Cache hits are **free** (no tokens charged).

```bash
# Enable caching for a request
or chat "What is 2+2?" --server-cache -m xiaomi/mimo-v2.5

# Set custom TTL (default 300 seconds)
or chat "What is 2+2?" --server-cache --server-cache-ttl 600 -m xiaomi/mimo-v2.5

# First request: cache MISS (billed normally)
# Second identical request: cache HIT (free!)
```

### When to Use Caching

- **Agent workflows**: Resume from failure without re-paying for earlier steps
- **Unit testing**: Deterministic responses at zero cost (use `--temperature 0`)
- **Repeated queries**: Same prompt sent multiple times

## Response Healing

The response healing plugin auto-fixes malformed JSON from models.

```bash
# Enable healing for structured output
or chat "Generate a product listing" --heal --json -m xiaomi/mimo-v2.5
```

What it fixes:
- Missing brackets, trailing commas
- Markdown code block wrappers
- Mixed text and JSON
- Unquoted keys

**Limitation**: Only works with non-streaming requests (`--no-stream`).

## Reasoning

```bash
or chat "Solve this step by step" -m deepseek/deepseek-v4-flash --reasoning-effort high --show-reasoning
```

## Conversations (Multi-Turn)

Maintain context across multiple messages. The model remembers previous turns.

```bash
# Start a new conversation
or chat "What is 2+2?" --conversation -m deepseek/deepseek-v4-pro
# → Creates conversation a3f2b1c0, shows ID in output

# Continue the most recent conversation (model remembers 2+2=4)
or chat "Now multiply by 10" --continue -m deepseek/deepseek-v4-pro
# → 4 * 10 = 40

# Resume a specific conversation by ID
or chat "Square root of that?" --resume a3f2b1c0 -m deepseek/deepseek-v4-pro
# → √40 ≈ 6.32
```

### Conversation Management

```bash
or conversations                    # List all conversations
or conversations show <id>          # View full thread + session totals
or conversations delete <id>        # Delete a conversation
or conversations list --json        # Machine-readable list
```

### Session Totals

`or conversations show` displays per-turn stats and session totals:

```
── Session Totals ──
  Turns:      3
  Tokens:     437 (389 in / 48 out)
  Cost:       $0.0000
  Latency:    8.2s total • 2.7s avg
```

### How It Works

- Conversations are stored in `~/.or-cli/conversations/` as JSONL files
- Each file contains the full message history (system, user, assistant turns)
- `--continue` loads the most recent conversation automatically
- `--resume <id>` loads a specific conversation by ID
- `--conversation` creates a new conversation (or appends if one already exists in the current session)
- All existing flags (`--model`, `--image`, `--stream`, etc.) work with conversations
- History logging continues independently — conversations are a separate layer

## Agent-Friendly Patterns

```bash
# Get just the text, nothing else
or chat "Summarize this" --quiet --no-stream

# Pipe into file
or chat "Generate a README" --quiet --no-stream > README.md

# Get full JSON response with token counts
or chat "List 3 colors" --json --no-stream

# Generate and save image
or chat "Generate a logo" -m black-forest-labs/flux.2-pro --save logo.png --no-stream

# Edit image and save result
or chat "Replace window with door" --image input.jpg -m black-forest-labs/flux.2-pro --save output.png --no-stream

# PDF with web search — comprehensive research
or chat "Analyze this PDF and search for related work" --pdf paper.pdf --web-search -m openai/gpt-5.2

# Cached repeated queries
or chat "Explain TCP" --server-cache -m xiaomi/mimo-v2.5  # First: MISS (billed)
or chat "Explain TCP" --server-cache -m xiaomi/mimo-v2.5  # Second: HIT (free!)
```

## Output Metrics

By default, `or chat` prints detailed metrics after the response:

```
  1303 tokens (4 in / 1299 out) • 186 tps • 7.0s • $0.0387 • black-forest-labs/flux.2-pro
```

Metrics include:
- **tokens** — total + input/output breakdown
- **tps** — tokens per second (output speed)
- **time** — total latency
- **cost** — actual API cost in USD
- **model** — model used
- **provider** — backend provider
- **img tokens** — image token count (for vision models)
- **reasoning tokens** — thinking token count (for reasoning models)
- **cached** — cached prompt tokens (if any)
- **file annotation(s)** — parsed PDF annotations (for PDF inputs)

## Chat History

```bash
or history list                    # Recent chats
or history show <id>               # Full details
or history search "query"          # Search prompts/responses
or history stats                   # Usage statistics
```

## Important Notes

- **Always specify a model with `-m`**. Without it, a default is used which may not be optimal.
- **Find the right model first** — use `or models` to search, then pass the full model ID.
- **Read model descriptions** with `or show <model-id>` before using. Names are misleading.
- **Free models have rate limits.** If you get a 429, fall back to a paid model.
- **`--quiet --no-stream`** is the most reliable pattern for agent pipelines.
- **Server tools cost extra** — web search is $0.005/request (Exa/Parallel), web fetch is $0.001/fetch.
- **PDF OCR costs** — Mistral OCR charges $0.001/1000 pages. Cloudflare AI is free.
- **`:exacto` routing** may cost more than default routing (prioritizes quality over price).
- **`--audio` is for INPUT only** — it sends audio to the model for transcription. For generating speech, use `or tts`.
