---
name: or-cli
description: Browse, search, filter, and compare AI models on OpenRouter using the `or` CLI. Use when the user asks about available models, wants to find a model for a task, needs pricing info, wants to compare options, asks "which model should I use", needs to check model capabilities, or wants provider/uptime info. Also use for chat/completions, multimodal tasks (image/audio/video/PDF analysis), server tools (web search, web fetch, datetime), benchmark queries, image generation/editing, embeddings, text-to-speech, and any OpenRouter API interaction.
---

# or CLI

The `or` CLI queries OpenRouter in real-time. **Never hardcode or guess model names** — always query live data. The model landscape changes constantly.

## Critical Rule: Always Read Model Descriptions

**Before using any model, read its description with `or show <model-id>`.** The model name and modality tag alone are NOT enough to know what a model does.

Common traps:
- A model with `audio` in its name might be **speech-to-text** (listens to audio), not **text-to-speech** (generates audio)
- A model with `image` output might be **image editing**, not **image generation**
- A model with `video` might be **video understanding** (input), not **video generation** (output)
- `google/lyria-3-pro-preview` outputs **music/songs**, not speech — despite being "text+image→text+audio"

**Always run `or show <model-id>` and read the description before using a model.**

## What this skill covers

- **[Model Discovery](references/models.md)** — Browse, search, filter, and compare models. Find the right model for any task.
- **[Chat & Completions](references/chat.md)** — Send messages, use reasoning, manage history, pipe output.
- **[Text-to-Speech (TTS)](references/tts.md)** — Generate speech audio from text. **Uses a dedicated endpoint, not `or chat`.**
- **[Rerank](references/rerank.md)** — Reorder documents by relevance to a query. **Uses a dedicated endpoint, not `or chat`.**
- **[Benchmarks](references/benchmarks.md)** — Query Artificial Analysis benchmarks for LLMs, image gen, TTS, and video.
- **[Image Models](references/image-gen.md)** — Generate images, edit images, and analyze images with vision models.
- **[Multimodal](references/multimodal.md)** — Process images, audio, and video inputs.

## Quick Reference

```bash
# Models
or models                           # List all models
or models "coding" --tools          # Search: tool-capable coding models
or models -t text --sort price -n 10  # Top 10 cheapest text models
or models -t speech -n 5            # Top 5 TTS models
or models --new                     # Recently added models
or models -f                        # Free models only
or show <model-id>                  # Full details with price ranges
or show <model-id>:exacto           # Show with :exacto variant info
or compare id1 id2 id3              # Side-by-side comparison
or compare id1 id2 --cost-estimate  # With cost per coding session

# Chat
or chat "question" -m <model-id>    # Send a message
or chat "describe" --image photo.jpg -m <model-id>  # Image analysis
or chat "transcribe" --audio recording.wav -m <model-id>  # Audio input (STT)
or chat "summarize" --video clip.mp4 -m <model-id>  # Video
or chat "explain" --pdf document.pdf -m <model-id>  # PDF analysis
or chat "what's new" --web-search -m <model-id>  # Web search enabled
or chat "read this" --web-fetch -m <model-id>  # URL fetching enabled
or chat "what time" --datetime -m <model-id>  # Current date/time
or chat "question" -m <model-id>:exacto  # Quality-first routing
or chat "question" --server-cache -m <model-id>  # Free cached responses
or chat "json" --heal --json -m <model-id>  # Auto-fix malformed JSON

# Text-to-Speech (TTS) — dedicated endpoint, NOT via `or chat`
or tts "Hello world" -o hello.mp3              # Generate speech
or tts --list-models                          # Discover TTS models
or tts --list-voices -m hexgrad/kokoro-82m    # List voices for a model
or tts "Text" -m sesame/csm-1b -v conversational_a -o out.mp3

# Rerank — dedicated endpoint, NOT via `or chat`
or rerank "query" "doc1" "doc2" "doc3"           # Rerank documents by relevance
or rerank "query" --file docs.txt               # Read documents from file
or rerank "query" -m cohere/rerank-4-pro        # Use a specific rerank model
cat docs.txt | or rerank "query"                # Pipe documents from stdin
or rerank "query" doc1 doc2 --top-n 3           # Only show top 3 results

# Conversations (multi-turn)
or chat "What is 2+2?" --conversation -m <model>  # Start a conversation
or chat "Now multiply by 10" --continue -m <model>  # Continue last conversation
or chat "What was that?" --resume <id> -m <model>  # Resume specific conversation
or conversations                    # List all conversations
or conversations show <id>          # View full thread with session totals
or conversations delete <id>        # Delete a conversation

# Benchmarks
or benchmarks --type llm --sort coding -n 10  # Best coders
or benchmarks --type llm --json               # JSON for piping
or benchmarks --type text-to-image --sort score -n 5  # Best image gen
or benchmarks --type image-editing --or -n 10  # With OpenRouter IDs

# Providers & Endpoints
or endpoints <model-id>             # Per-provider uptime/latency
or providers                        # All providers with datacenter locations

# Rankings & Popularity
or rankings                         # Daily token usage (top models)
or rankings --model deepseek        # Filter by model name

# Spending
or cost                             # Spending breakdown by model
or cost --by-day                    # Spending by day
```

## Common Mistakes

- **Always read model descriptions with `or show <model-id>` before using a model.** Model names and modality tags are misleading. A model tagged `audio` could be speech-to-text, text-to-speech, music generation, or audio understanding. The description tells you what it actually does.
- **Always specify a model with `-m`**. Without it, a default is used which may not be optimal.
- **Model IDs include the provider prefix** — e.g. `deepseek/deepseek-v4-flash`, not just `deepseek-v4-flash`.
- **Benchmark model IDs ≠ OpenRouter model IDs.** Benchmarks from Artificial Analysis track models across many providers. Always use `or models -t <type>` to find actual OpenRouter IDs — don't assume a benchmark model name works with `or chat`.
- **Vision ≠ Generation**: Vision models understand images (image→text). They don't create them.
- **TTS ≠ Chat**: Text-to-speech uses a dedicated `/api/v1/audio/speech` endpoint via `or tts`, NOT `or chat`. See [references/tts.md](references/tts.md).
- **Rerank ≠ Chat**: Reranking uses a dedicated `/api/v1/rerank` endpoint via `or rerank`, NOT `or chat`. See [references/rerank.md](references/rerank.md).
- **`-t audio` is ambiguous** — it matches ALL audio-capable models (STT input, TTS output, music gen, audio understanding). Use `-t speech` or `or tts --list-models` for TTS specifically.
- **Free models have rate limits.** If you get a 429, fall back to a paid model.
- **`--quiet` only works on `or chat`** — other commands will warn and suggest `--json` instead.
- **Use `--save <path>` for images** — the CLI auto-sets `modalities` for image generation models.
- **Use `--json` for piping** — all commands support `--json` for machine-readable output.
- **Use `or rankings` for popularity** — this shows real usage data, not benchmarks.
- **Use `or compare --cost-estimate`** — quickly see how much a model costs per typical coding session.
- **Use `:exacto` suffix for quality-first routing** — when tool-calling reliability matters more than cost.
- **Use `--server-cache` for repeated queries** — cache hits are free (no tokens charged).
- **PDFs work with any model** — OpenRouter parses them server-side via Cloudflare AI or Mistral OCR.
- **Server tools are model-decided** — with `--web-search`, the model decides when to search, you don't control it.
