---
name: or-chat
description: Send messages to any AI model on OpenRouter. Use when the user wants to ask a model a question, get a completion, talk to a specific model, get help from a smarter model, test a model's response, or have a model analyze/summarize/generate content. Also use for multimodal tasks: analyzing images, transcribing audio, summarizing video, extracting text from screenshots, or generating embeddings. Can target any model by ID.
---

# Chat with `or`

Use `or chat` to send single-shot messages to any model on OpenRouter. Supports text, images, audio, and video inputs.

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
| `--reasoning-effort <level>` | Reasoning effort: low, medium, high |
| `--show-reasoning` | Show reasoning/thinking output |
| `--image <path>` | Send an image file (jpg, png, gif, webp) |
| `--audio <path>` | Send an audio file (wav, mp3, m4a, flac) |
| `--video <path>` | Send a video file (mp4, webm, mov) |
| `--json` | Full API response as JSON |
| `--quiet` | Only the response text (for piping) |
| `--stream` / `--no-stream` | Stream vs wait for full response |
| `--no-log` | Don't save to history |

## Multimodal Inputs

```bash
# Image analysis
or chat "What's in this image?" --image photo.jpg -m google/gemini-2.5-flash

# Audio transcription
or chat "Transcribe this audio" --audio recording.wav -m google/gemini-2.5-flash

# Video summarization
or chat "Summarize this video" --video clip.mp4 -m google/gemini-2.5-flash
```

## Reasoning

```bash
or chat "Solve this step by step" -m deepseek/deepseek-v4-flash --reasoning-effort high --show-reasoning
```

## Agent-Friendly Patterns

```bash
# Get just the text, nothing else
or chat "Summarize this" --quiet --no-stream

# Pipe into file
or chat "Generate a README" --quiet --no-stream > README.md

# Get full JSON response with token counts
or chat "List 3 colors" --json --no-stream
```

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
- **Free models have rate limits.** If you get a 429, fall back to a paid model.
- **`--quiet --no-stream`** is the most reliable pattern for agent pipelines.
