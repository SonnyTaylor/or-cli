---
name: or-chat
description: Send messages to AI models via OpenRouter using the `or` CLI. Use when the user wants to ask a model a question, get a completion, or test a model's response.
---

# Chat with `or`

Use `or chat` to send single-shot messages to any model on OpenRouter.

## Basic Usage

```bash
or chat "What is the capital of France?"
or chat "Explain monads" -m deepseek/deepseek-v4-flash
or chat "Write a haiku" -m google/gemini-2.5-flash --max-tokens 100
```

## Flags

| Flag | Purpose |
|------|---------|
| `-m, --model <id>` | Model to use (find one with `or models`) |
| `-s, --system <prompt>` | System prompt |
| `--max-tokens <n>` | Cap response length |
| `--temperature <n>` | Creativity (0-2, default varies by model) |
| `--json` | Full API response as JSON (includes usage, provider info) |
| `--quiet` | Only the response text — for piping into other tools |
| `--stream` / `--no-stream` | Stream output (default for TTY) vs wait for full response |
| `--no-log` | Don't save to history |

## Agent-Friendly Patterns

```bash
# Get just the text, nothing else
or chat "Summarize this" --quiet --no-stream

# Pipe into file
or chat "Generate a README" --quiet --no-stream > README.md

# Get full JSON response with token counts
or chat "List 3 colors" --json --no-stream

# Model selection workflow — always discover first
or models --tools --sort price -n 1 --json
```

## Chat History

All chats are automatically logged. Manage history with:

```bash
or history list                    # Recent chats
or history show <id>               # Full details of a chat
or history search "query"          # Search prompts/responses
or history stats                   # Usage statistics (tokens, cost, models used)
or history clear                   # Clear all history
```

History includes: prompt, response, model, provider, token counts, cost estimate, latency.

## Important Notes

- **Always specify a model with `-m`**. Without it, a default is used which may not be optimal.
- **Find the right model first** — use `or models` to search, then pass the full model ID.
- **Free models have rate limits.** If you get a 429, fall back to a paid model.
- **`--quiet --no-stream`** is the most reliable pattern for agent pipelines.
- **Cost estimates** in history are calculated from model pricing — actual costs may vary by provider.
