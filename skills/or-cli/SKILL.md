---
name: or-cli
description: Full OpenRouter CLI — chat, ask, image/video/audio generation, image editing, embeddings, transcription, reranking, model discovery, benchmarks. Use when the user wants to interact with AI models, generate or edit media, embed text, transcribe audio, rerank documents, search models, compare pricing, or do anything with OpenRouter.
---

# or CLI

The `or` CLI is the full OpenRouter API surface from the terminal.

## Rule 1: Never Pick Models From Memory

**Your training data about models is stale.** New models ship weekly and the "best"
model changes constantly. Never hardcode a model name you remember — discover it:

```bash
or models -n 20                      # What's actually used right now (live weekly
                                     #   popularity + benchmark scores + release dates)
or models -n 20 -t image             # Same, for image models
or benchmarks -n 10 --sort coding    # Best coders, with OpenRouter IDs inline
or models --new                      # Released in the last 30 days
```

Model listings show Artificial Analysis benchmark scores (Intel/Coding/Speed) and
release dates automatically; benchmark tables show the exact OpenRouter ID to use.
Pick from live data, then verify with `or show <id>`.

## Rule 2: Read Model Descriptions

**Before using any model, run `or show <model-id>`.** Model names lie:

- A model tagged `audio` might be STT, TTS, music gen, or audio understanding
- A model tagged `image` output might be editing-only or generation
- A model tagged `video` might be video understanding (input), not generation (output)
- `google/lyria-3-pro-preview` outputs **music**, not speech

## Command Map

| Intent | Command | Example |
|--------|---------|---------|
| Ask a question (one-shot) | `or ask` | `or ask "What's 2+2?" -m <id>` |
| Multi-turn conversation | `or chat` | `or chat "Let's plan" --conversation` |
| Generate image | `or create image` | `or create image "A cat" --save cat.png` |
| **Edit / transform image** | `or create image --image` | `or create image "make it night" --image day.png --save night.png` |
| Generate video | `or create video` | `or create video "A cat walking" --save cat.mp4` |
| Generate speech (TTS) | `or create audio` | `or create audio "Hello" -o hello.mp3` |
| Embed text/media | `or embed` | `or embed "Hello world" --dimensions 64` |
| Transcribe audio (STT) | `or transcribe` | `or transcribe recording.mp3` |
| Rerank documents | `or rerank` | `or rerank "query" "doc1" "doc2"` |
| Search models | `or models` | `or models "coding" --tools` |
| Model details | `or show` | `or show <model-id>` |
| Compare models | `or compare` | `or compare id1 id2` |
| Benchmarks + OR IDs | `or benchmarks` | `or benchmarks --sort coding -n 10` |
| Provider info | `or providers` / `or endpoints` | `or endpoints <model-id>` |
| Account | `or credits` / `or cost` | `or cost --by-day` |
| Config | `or config` / `or auth` | `or config --show` |
| History | `or history` / `or conversations` | `or history list` |
| Diagnostics | `or doctor` / `or version` | `or doctor` |

## Quick Reference

```bash
# ── Model Discovery (do this FIRST) ──────────────────────────────────
or models -n 20                     # Live popularity + benchmarks + release dates
or models "coding" --tools          # Tool-capable coding models
or models -t image -n 10            # Image generation models
or models --sort intelligence -n 10 # Smartest first
or benchmarks -n 10                 # Top LLMs w/ OpenRouter IDs (green = usable)
or benchmarks --type text-to-image -n 10   # Best image models w/ OR IDs
or benchmarks --type image-editing -n 10   # Best editing models w/ OR IDs
or show <model-id>                  # Full details — always check before use

# ── One-shot Q&A ──────────────────────────────────────────────────────
or ask "Explain monads" -m <id>
or ask "Describe this" --image photo.jpg -m <vision-id>
or ask "Transcribe this" --audio recording.wav -m <audio-id>
or ask "Summarize" --pdf report.pdf -m <id>
or ask "What's new?" --web-search -m <id>

# ── Conversations (multi-turn) ────────────────────────────────────────
or chat "What is 2+2?" --conversation -m <id>
or chat "Now multiply by 10" --continue
or conversations                    # List all

# ── Image Generation & Editing ────────────────────────────────────────
or create image "A logo of a mountain" --save logo.png -m <image-id>
or create image "Make the sky purple" --image photo.jpg --save edited.png -m <edit-id>
or create image "Combine these" --image a.png b.png --save c.png -m <edit-id>

# ── Video Generation (async — polls until done) ──────────────────────
or create video "A cat walking on a beach" --save cat.mp4
or create video --list-models       # Find video models

# ── Audio Generation (TTS) ────────────────────────────────────────────
or create audio "Hello world" -o hello.mp3
or create audio --list-models       # Find TTS models
or create audio --list-voices -m <tts-id>   # Voices are model-specific

# ── Embeddings / Transcription / Reranking ────────────────────────────
or embed "Hello world" --dimensions 64
or transcribe recording.mp3 --output transcript.txt
or rerank "capital of France?" "Paris..." "Berlin..." --top-n 3

# ── Account & History ────────────────────────────────────────────────
or credits                          # Account balance
or cost --by-day                    # Spending breakdown
or cache clear                      # Clear cache
```

## Common Mistakes

- **Picking a model from training-data memory.** Always `or models` / `or benchmarks` first — defaults are sorted by live usage with benchmark scores inline.
- **Thinking image editing isn't supported.** `or create image --image <path>` IS the image-editing path. Don't route editing through `or ask`.
- **`--image` means different things**: on `or create image` it's an *input to edit*; on `or ask` it's an image to *analyze*.
- **Always `or show <model-id>` before using a model.** Names and tags lie; the description is the truth.
- **Model IDs include provider prefix** — `deepseek/deepseek-v4-flash`, not `deepseek-v4-flash`.
- **Benchmark names ≠ OpenRouter IDs.** Use the green "OpenRouter ID" column from `or benchmarks` (automatic) — never guess an ID from a benchmark name.
- **`or ask` for one-shot, `or chat` for conversations.**
- **`or create image/video/audio` for generation** — not `or ask`/`or chat`.
- **Video gen is async.** `or create video` submits, polls, downloads (30s–several minutes).
- **TTS voices are model-specific.** `or create audio --list-voices -m <model>` first.
- **Free models have rate limits.** Fall back to paid models on 429s.
- **`--json` for piping, `--quiet` for minimal output.** All commands support both.
- **Exit codes**: 0 success, 1 runtime/API error, 2 bad arguments, 3 auth missing.
- **Server tools cost extra.** Web search $0.005/request, web fetch $0.001/fetch.
- **`:exacto` suffix** for stronger tool-calling reliability.
- **PDFs work with any model.** OpenRouter parses them server-side.

## Detailed References

| Topic | File |
|-------|------|
| One-shot Q&A | [references/ask.md](references/ask.md) |
| Conversations | [references/chat.md](references/chat.md) |
| Image generation & editing | [references/image-gen.md](references/image-gen.md) |
| Video generation | [references/video-gen.md](references/video-gen.md) |
| Audio generation (TTS) | [references/audio-gen.md](references/audio-gen.md) |
| Embeddings | [references/embed.md](references/embed.md) |
| Transcription (STT) | [references/transcribe.md](references/transcribe.md) |
| Reranking | [references/rerank.md](references/rerank.md) |
| Multimodal inputs | [references/multimodal.md](references/multimodal.md) |
| Model discovery | [references/models.md](references/models.md) |
| Benchmarks | [references/benchmarks.md](references/benchmarks.md) |
