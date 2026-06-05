---
name: or-cli
description: Full OpenRouter CLI — chat, ask, image/video/audio generation, embeddings, transcription, reranking, model discovery, benchmarks. Use when the user wants to interact with AI models, generate media, embed text, transcribe audio, rerank documents, search models, compare pricing, or do anything with OpenRouter.
---

# or CLI

The `or` CLI is the full OpenRouter API surface from the terminal. **Never hardcode or guess model names** — always query live data.

## Critical: Read Model Descriptions

**Before using any model, run `or show <model-id>`.** Model names lie:

- A model tagged `audio` might be STT, TTS, music gen, or audio understanding
- A model tagged `image` output might be image editing, not generation
- A model tagged `video` might be video understanding (input), not generation (output)
- `google/lyria-3-pro-preview` outputs **music**, not speech

## Command Map

| Intent | Command | Example |
|--------|---------|---------|
| Ask a question (one-shot) | `or ask` | `or ask "What's 2+2?" -m deepseek/deepseek-v4-flash` |
| Multi-turn conversation | `or chat` | `or chat "Let's plan" --conversation` |
| Generate image | `or create image` | `or create image "A cat" --save cat.png` |
| Generate video | `or create video` | `or create video "A cat walking" --save cat.mp4` |
| Generate speech (TTS) | `or create audio` | `or create audio "Hello" -o hello.mp3` |
| Embed text/media | `or embed` | `or embed "Hello world" --dimensions 64` |
| Transcribe audio (STT) | `or transcribe` | `or transcribe recording.mp3` |
| Rerank documents | `or rerank` | `or rerank "query" "doc1" "doc2"` |
| Search models | `or models` | `or models "coding" --tools` |
| Model details | `or show` | `or show google/gemini-2.5-flash` |
| Compare models | `or compare` | `or compare model1 model2` |
| Benchmarks | `or benchmarks` | `or benchmarks --type llm --sort coding` |
| Provider info | `or providers` / `or endpoints` | `or endpoints <model-id>` |
| Account | `or credits` / `or cost` | `or cost --by-day` |
| Config | `or config` / `or auth` | `or config --show` |
| History | `or history` / `or conversations` | `or history list` |
| Diagnostics | `or doctor` / `or version` | `or doctor` |

## Quick Reference

```bash
# ── One-shot Q&A ──────────────────────────────────────────────────────
or ask "Explain monads" -m deepseek/deepseek-v4-flash
or ask "Describe this" --image photo.jpg -m xiaomi/mimo-v2.5
or ask "Transcribe this" --audio recording.wav -m xiaomi/mimo-v2.5
or ask "Summarize" --pdf report.pdf -m anthropic/claude-sonnet-4
or ask "What's new?" --web-search -m openai/gpt-5.2
or ask "question" -m deepseek/deepseek-v4-flash:exacto
or ask "question" --server-cache -m xiaomi/mimo-v2.5
or ask "json output" --heal --json -m xiaomi/mimo-v2.5

# ── Conversations (multi-turn) ────────────────────────────────────────
or chat "What is 2+2?" --conversation -m deepseek/deepseek-v4-pro
or chat "Now multiply by 10" --continue
or chat "What was that?" --resume <id>
or conversations                    # List all
or conversations show <id>          # View thread

# ── Image Generation ──────────────────────────────────────────────────
or create image "A logo of a mountain" --save logo.png -m black-forest-labs/flux.2-pro
or create image "A red circle" --save circle.png --aspect-ratio 1:1
or models -t image                  # Find image models

# ── Video Generation (async — polls until done) ──────────────────────
or create video "A cat walking on a beach" --save cat.mp4
or create video "A sunset" --save sunset.mp4 --resolution 1080p --duration 5
or create video --list-models       # Find video models
or models -t video                  # Alternative

# ── Audio Generation (TTS) ────────────────────────────────────────────
or create audio "Hello world" -o hello.mp3
or create audio "Hello" -m sesame/csm-1b -v conversational_a -o out.mp3
or create audio --list-models       # Find TTS models
or create audio --list-voices -m hexgrad/kokoro-82m  # List voices

# ── Embeddings ────────────────────────────────────────────────────────
or embed "Hello world" --dimensions 64
or embed "Hello world" -m openai/text-embedding-3-small --json
or embed --list-models              # Find embedding models
or embed --image photo.jpg --dimensions 64  # Multimodal embedding

# ── Transcription (STT) ──────────────────────────────────────────────
or transcribe recording.mp3
or transcribe interview.wav --language en --output transcript.txt
or transcribe podcast.m4a -m openai/whisper-large-v3 --json

# ── Reranking ─────────────────────────────────────────────────────────
or rerank "capital of France?" "Paris..." "Berlin..." "London..."
or rerank "query" --file docs.txt --top-n 3
cat docs.txt | or rerank "query"

# ── Model Discovery ──────────────────────────────────────────────────
or models                           # All models
or models "coding" --tools          # Tool-capable coding models
or models -t text --sort price -n 10
or models --new                     # Added in last 30 days
or models -f                        # Free models
or show <model-id>                  # Full details
or compare id1 id2 --cost-estimate  # Side-by-side with cost

# ── Benchmarks ────────────────────────────────────────────────────────
or benchmarks --type llm --sort coding -n 10
or benchmarks --type text-to-image --sort score -n 5
or benchmarks --type text-to-video --or -n 10

# ── Account & History ────────────────────────────────────────────────
or credits                          # Account balance
or cost --by-day                    # Spending breakdown
or history list                     # Chat history
or cache stats                      # Cache info
or cache clear                      # Clear cache
```

## Common Mistakes

- **Always `or show <model-id>` before using a model.** Names and tags lie. The description is the only truth.
- **Always specify `-m`.** Without it, a default is used which may not be optimal.
- **Model IDs include provider prefix** — `deepseek/deepseek-v4-flash`, not `deepseek-v4-flash`.
- **Benchmark model IDs ≠ OpenRouter IDs.** Use `or models -t <type>` to find real IDs, or `or benchmarks --or` to cross-reference.
- **`or ask` for one-shot, `or chat` for conversations.** Don't use `or chat` for single questions.
- **`or create image/video/audio` for generation.** Don't use `or ask` or `or chat` for media generation.
- **`or transcribe` for dedicated STT.** `or ask --audio` works for quick transcription, but `or transcribe` gives you `--output`, `--language`, and `--json` with usage stats.
- **`or embed` for embeddings.** Don't try to get embeddings from `or ask`.
- **`or rerank` for reranking.** Don't use `or ask` or `or chat` for reranking.
- **Video gen is async.** `or create video` submits a job, polls, and downloads. It takes 30s–several minutes.
- **TTS voices are model-specific.** Run `or create audio --list-voices -m <model>` before using a voice.
- **Free models have rate limits.** Fall back to paid models if you get 429s.
- **`--json` for piping.** All commands support `--json` for machine-readable output.
- **`--quiet` for minimal output.** Suppresses non-essential output; returns only the core result.
- **Server tools cost extra.** Web search $0.005/request, web fetch $0.001/fetch.
- **`:exacto` for quality.** Use suffix `:exacto` or `--exacto` flag when tool-calling reliability matters.
- **`--server-cache` for free retries.** Cache hits are zero-cost.
- **PDFs work with any model.** OpenRouter parses them server-side.

## Detailed References

| Topic | File |
|-------|------|
| One-shot Q&A | [references/ask.md](references/ask.md) |
| Conversations | [references/chat.md](references/chat.md) |
| Image generation | [references/image-gen.md](references/image-gen.md) |
| Video generation | [references/video-gen.md](references/video-gen.md) |
| Audio generation (TTS) | [references/audio-gen.md](references/audio-gen.md) |
| Embeddings | [references/embed.md](references/embed.md) |
| Transcription (STT) | [references/transcribe.md](references/transcribe.md) |
| Reranking | [references/rerank.md](references/rerank.md) |
| Multimodal inputs | [references/multimodal.md](references/multimodal.md) |
| Model discovery | [references/models.md](references/models.md) |
| Benchmarks | [references/benchmarks.md](references/benchmarks.md) |
