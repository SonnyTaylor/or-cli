# Conversations with `or chat`

`or chat` manages multi-turn conversations with persistent context. For one-shot questions, use [`or ask`](ask.md).

## Basic Usage

```bash
# Start a new conversation
or chat "What is 2+2?" --conversation -m deepseek/deepseek-v4-pro
# → Creates conversation a3f2b1c0, shows ID in output

# Continue the most recent conversation (model remembers 2+2=4)
or chat "Now multiply by 10" --continue
# → 4 * 10 = 40

# Resume a specific conversation by ID
or chat "Square root of that?" --resume a3f2b1c0
# → √40 ≈ 6.32
```

## Conversation Management

```bash
or conversations                    # List all conversations
or conversations show <id>          # View full thread + session totals
or conversations delete <id>        # Delete a conversation
or conversations list --json        # Machine-readable list
```

## Session Totals

`or conversations show` displays per-turn stats and session totals:

```
── Session Totals ──
  Turns:      3
  Tokens:     437 (389 in / 48 out)
  Cost:       $0.0000
  Latency:    8.2s total • 2.7s avg
```

## Multimodal Inputs

All multimodal inputs work in conversations:

```bash
# Start with an image
or chat "Describe this" --image photo.jpg --conversation -m xiaomi/mimo-v2.5

# Continue (model remembers the image context)
or chat "What color was the sky?" --continue

# Add a PDF mid-conversation
or chat "Now compare with this" --pdf report.pdf --continue
```

## Server Tools

All server tools work in conversations:

```bash
or chat "What's new in AI?" --web-search --conversation -m openai/gpt-5.2
or chat "Summarize that article" --continue
```

## Flags

Same flags as `or ask`, plus conversation-specific flags:

| Flag | Purpose |
|------|---------|
| `--conversation` | Start a new conversation |
| `--continue` | Continue the most recent conversation |
| `--resume <id>` | Resume a specific conversation by ID |

All other flags (`-m`, `--image`, `--web-search`, `--json`, `--quiet`, etc.) work the same as `or ask`.

## How It Works

- Conversations are stored in `~/.or-cli/conversations/` as JSONL files
- Each file contains the full message history (system, user, assistant turns)
- `--continue` loads the most recent conversation automatically
- `--resume <id>` loads a specific conversation by ID
- `--conversation` creates a new conversation
- History logging continues independently — conversations are a separate layer

## Agent Patterns

```bash
# Pipe-friendly conversation
or chat "What is 2+2?" --conversation --quiet --no-stream
or chat "Multiply by 10" --continue --quiet --no-stream

# JSON response with full metadata
or chat "Explain this" --json --no-stream --conversation
```

## Notes

- **Use `or ask` for one-shot questions.** `or chat` is for multi-turn conversations.
- **`--conversation` starts fresh.** `--continue` resumes the last one. `--resume <id>` picks a specific one.
- **Model context window matters.** Long conversations will eventually hit the context limit.
- **Read model descriptions** with `or show <model-id>` before using.
