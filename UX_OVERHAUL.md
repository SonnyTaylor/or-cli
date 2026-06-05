# or-cli UX Overhaul — v0.5.0 Design Spec

## Guiding Principles

1. **Task-oriented, not API-oriented.** Commands name what the user wants to do.
2. **Progressive disclosure.** Simple by default; powerful flags when needed.
3. **Agent-native.** Every command supports `--json`, `--quiet`, predictable exit codes, and stdin/stdout pipes.
4. **Consistent patterns.** Same flags behave the same way everywhere.

---

## New Command Taxonomy

### Analysis & Conversation

| Command | Purpose | Example |
|---------|---------|---------|
| `or ask <prompt>` | One-shot Q&A (no persistence) | `or ask "What's quantum computing?"` |
| `or ask ... --image x.jpg` | Vision analysis | `or ask "Describe this" --image photo.jpg` |
| `or ask ... --video x.mp4` | Video analysis | `or ask "What's happening?" --video clip.mp4` |
| `or ask ... --audio x.mp3` | Audio analysis | `or ask "Transcribe this" --audio clip.mp3` |
| `or ask ... --pdf doc.pdf` | Document analysis | `or ask "Summarize" --pdf report.pdf` |
| `or chat <prompt>` | Start/continue a conversation | `or chat "Let's plan a trip" --conversation` |
| `or chat --continue` | Resume last conversation | `or chat --continue` |
| `or chat --resume <id>` | Resume specific conversation | `or chat --resume abc123` |

### Generation (Creation)

| Command | Purpose | Example |
|---------|---------|---------|
| `or create image <prompt>` | Image generation | `or create image "A cat in space" --save cat.png` |
| `or create video <prompt>` | Video generation | `or create video "A cat walking" --save cat.mp4` |
| `or create audio <prompt>` | Text-to-speech | `or create audio "Hello world" -o hello.mp3` |

### Processing

| Command | Purpose | Example |
|---------|---------|---------|
| `or rerank <query> [docs...]` | Document reranking | `or rerank "capital of France" doc1 doc2` |
| `or embed <text>` | Text/multimodal embeddings | `or embed "Hello world" --dimensions 64` |
| `or transcribe <file>` | Speech-to-text | `or transcribe recording.mp3` |

### Discovery

| Command | Purpose | Example |
|---------|---------|---------|
| `or models [search]` | Search/filter models | `or models --search "coding"` |
| `or show <model>` | Model details | `or show google/gemini-2.5-flash` |
| `or compare <m1> <m2>` | Side-by-side comparison | `or compare gpt-4o claude-sonnet` |
| `or benchmarks` | Artificial Analysis benchmarks | `or benchmarks --type llm -n 5` |
| `or rankings` | Daily token usage | `or rankings` |
| `or providers` | Provider datacenters | `or providers` |
| `or endpoints <model>` | Per-provider pricing | `or endpoints google/gemini-2.5-flash` |

### System & Account

| Command | Purpose |
|---------|---------|
| `or auth` | API key management |
| `or config` | Default models, cache TTL |
| `or credits` | Account balance |
| `or cost` | Spending breakdown |
| `or history` | Chat history (JSONL) |
| `or cache` | Cache stats & clear |
| `or doctor` | Connectivity diagnostics |
| `or version` | Version info |

---

## Shared Flag Contract (Every Command)

| Flag | Behavior |
|------|----------|
| `--json` | Full structured JSON output to stdout |
| `--quiet` | Suppress all non-essential output; return only the core result |
| `-m, --model <model>` | Override the default model |
| `--no-cache` | Bypass the file-based cache |

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Runtime error (API failure, network, etc.) |
| `2` | Validation error (bad args, missing files, invalid model) |
| `3` | Authentication error (missing/invalid API key) |

---

## Pipeability Rules

1. **Input:** If no positional arguments are provided, read from stdin.
2. **Output:** Always write the primary result to stdout.
3. **File output:** Only write to disk when `--save` or `-o` is explicitly passed.
4. **Errors:** Always write errors to stderr, never stdout.

### Pipe Examples

```bash
# Chain: extract docs → rerank → ask for summary
cat docs.txt | or rerank "query" --top-n 5 | or ask "Summarize these"

# Generate code and save to file
or ask "Write a Python function" --quiet > func.py

# Generate image from piped prompt
echo "A cat" | or create image --save cat.png

# Filter models and get details
or models --search "vision" --json | jq -r '.[].id' | head -5 | xargs -I {} or show {} --json
```

---

## `or ask` vs `or chat` vs `or create`

### `or ask` — One-shot analysis
- **Goal:** Get an answer, then exit.
- **Persistence:** No conversation history unless `--no-log` is omitted.
- **Streaming:** Yes, by default in TTY.
- **Multimodal inputs:** `--image`, `--audio`, `--video`, `--pdf`.
- **Output:** Text to stdout (or JSON with `--json`).

### `or chat` — Conversational interaction
- **Goal:** Multi-turn back-and-forth with context.
- **Persistence:** Conversations saved to `~/.or-cli/conversations/`.
- **Streaming:** Yes, by default in TTY.
- **Multimodal inputs:** Same as `ask`.
- **Output:** Text to stdout, conversation ID printed to stderr.

### `or create` — Media generation
- **Goal:** Produce a file (image, video, audio).
- **Persistence:** No conversation context.
- **Streaming:** No (media doesn't stream).
- **Output:** Saved to disk via `--save` or `-o`. Metadata printed to stdout (or JSON).

---

## Implementation Plan

### Phase 1: Extract Shared Core
- Create `src/lib/chat-core.ts`
  - Message building (multimodal inputs, system prompt)
  - Request building (tools, plugins, headers, modalities)
  - Streaming handler
  - Non-streaming handler
  - History logging
  - Cost estimation
  - Stats printing

### Phase 2: Create `or ask`
- New file: `src/commands/ask.ts`
- One-shot Q&A using chat-core
- All multimodal inputs
- No conversation management

### Phase 3: Create `or create`
- New file: `src/commands/create.ts`
- Subcommands: `image`, `video`, `audio`
- `audio` replaces `or tts` logic
- `image` extracts base64 from `/chat/completions` response
- `video` extracts URL from response (and optionally downloads)

### Phase 4: Refactor `or chat`
- Strip one-shot-only logic (moved to `ask`)
- Keep conversation management
- Use chat-core for API calls

### Phase 5: Deprecate `or tts`
- Remove `ttsCommand()` from `cli.ts`
- `or tts` users migrate to `or create audio`

### Phase 6: Global UX Polish
- Add `--quiet` and `--json` to all commands that lack them
- Standardize exit codes
- Add stdin fallback to commands that accept text input

---

## Migration Guide (for users)

| Old Command | New Command |
|-------------|-------------|
| `or chat "What's 2+2?"` | `or ask "What's 2+2?"` |
| `or chat "A cat" --save cat.png` | `or create image "A cat" --save cat.png` |
| `or tts "Hello" -o hello.mp3` | `or create audio "Hello" -o hello.mp3` |
| `or chat "Describe this" --image x.jpg` | `or ask "Describe this" --image x.jpg` |
| `or chat "Let's talk" --conversation` | `or chat "Let's talk" --conversation` *(unchanged)* |
