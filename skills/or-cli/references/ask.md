# One-Shot Q&A with `or ask`

`or ask` sends a single question and gets an answer. No conversation persistence. For multi-turn conversations, use [`or chat`](chat.md).

## Basic Usage

```bash
or ask "What is the capital of France?"
or ask "Explain monads" -m deepseek/deepseek-v4-flash
or ask "Write a haiku" -m xiaomi/mimo-v2.5 --max-tokens 100
```

## Multimodal Inputs

```bash
# Image analysis
or ask "What's in this image?" --image photo.jpg -m xiaomi/mimo-v2.5

# Audio analysis
or ask "Transcribe this" --audio recording.wav -m xiaomi/mimo-v2.5

# Video analysis
or ask "Summarize this video" --video clip.mp4 -m xiaomi/mimo-v2.5

# PDF analysis (local or URL)
or ask "Summarize this document" --pdf report.pdf -m anthropic/claude-sonnet-4
or ask "What are the main points?" --pdf https://example.com/paper.pdf -m anthropic/claude-sonnet-4

# PDF with specific engine
or ask "Extract text" --pdf scanned.pdf --pdf-engine mistral-ocr -m xiaomi/mimo-v2.5
```

## Server Tools

```bash
# Web search — model decides when to search
or ask "What are the latest AI news?" --web-search -m openai/gpt-5.2
or ask "Find recent papers" --web-search --web-search-engine exa -m openai/gpt-5.2

# Web fetch — model can fetch URLs
or ask "Summarize this page" --web-fetch -m openai/gpt-5.2

# Datetime — model gets current date/time
or ask "What day is it?" --datetime -m openai/gpt-5.2

# Combine
or ask "What's happening today?" --web-search --datetime -m openai/gpt-5.2
```

## Quality & Caching

```bash
# Exacto — quality-first routing
or ask "Draft a changelog" -m moonshotai/kimi-k2-0905:exacto
or ask "Draft a changelog" -m moonshotai/kimi-k2-0905 --exacto

# Server cache — free cache hits
or ask "What is 2+2?" --server-cache -m xiaomi/mimo-v2.5
or ask "What is 2+2?" --server-cache --server-cache-ttl 600 -m xiaomi/mimo-v2.5

# Response healing — auto-fix malformed JSON
or ask "Generate a product listing" --heal --json -m xiaomi/mimo-v2.5

# Reasoning
or ask "Solve step by step" -m deepseek/deepseek-v4-flash --reasoning-effort high --show-reasoning
```

## Flags

| Flag | Purpose |
|------|---------|
| `-m, --model <id>` | Model to use |
| `-s, --system <prompt>` | System prompt |
| `--max-tokens <n>` | Max response tokens |
| `--temperature <n>` | Creativity (0-2) |
| `--reasoning-effort <level>` | low, medium, high |
| `--show-reasoning` | Show reasoning output |
| `--image <paths...>` | Image file(s) |
| `--audio <path>` | Audio file |
| `--video <path>` | Video file |
| `--pdf <path>` | PDF file (local or URL) |
| `--pdf-engine <engine>` | native, cloudflare-ai, mistral-ocr |
| `--web-search` | Enable web search |
| `--web-search-engine <engine>` | auto, exa, firecrawl, parallel |
| `--web-search-max <n>` | Max search results |
| `--web-fetch` | Enable URL fetching |
| `--datetime` | Enable datetime tool |
| `--exacto` | Quality-first routing |
| `--server-cache` | Enable caching |
| `--server-cache-ttl <seconds>` | Cache TTL |
| `--heal` | Auto-fix malformed JSON |
| `--save <path>` | Save generated image |
| `--json` | Full API response as JSON |
| `--quiet` | Only response text |
| `--stream` / `--no-stream` | Streaming control |
| `--no-log` | Don't save to history |

## Agent Patterns

```bash
# Get just text, nothing else
or ask "Summarize this" --quiet --no-stream

# Pipe into file
or ask "Generate a README" --quiet --no-stream > README.md

# Full JSON with token counts
or ask "List 3 colors" --json --no-stream

# Stdin input
echo "What is 2+2?" | or ask
cat prompt.txt | or ask -m deepseek/deepseek-v4-flash
```

## Output

Default output includes the response text plus a stats line:

```
  1303 tokens (4 in / 1299 out) • 186 tps • 7.0s • $0.0387 • model-name
```

With `--quiet`: only the response text.
With `--json`: full API response object.

## Notes

- **One-shot only.** No conversation context is preserved between calls. Use `or chat --conversation` for multi-turn.
- **Streaming on by default** in TTY. Use `--no-stream` for non-interactive contexts.
- **History is logged** unless `--no-log` is passed.
- **Read model descriptions** with `or show <model-id>` before using.
- **`--audio` is for analysis** (sends audio to model). For generating speech, use `or create audio`.
