---
name: or-cli
description: Browse, search, filter, and compare AI models on OpenRouter using the `or` CLI. Use when the user asks about available models, wants to find a model for a task, needs pricing info, wants to compare options, asks "which model should I use", needs to check model capabilities, or wants provider/uptime info. Also use for chat/completions, multimodal tasks (image/audio/video analysis), benchmark queries, image generation/editing, embeddings, and any OpenRouter API interaction.
---

# or CLI

The `or` CLI queries OpenRouter in real-time. **Never hardcode or guess model names** — always query live data. The model landscape changes constantly.

## What this skill covers

- **[Model Discovery](references/models.md)** — Browse, search, filter, and compare models. Find the right model for any task.
- **[Chat & Completions](references/chat.md)** — Send messages, use reasoning, manage history, pipe output.
- **[Benchmarks](references/benchmarks.md)** — Query Artificial Analysis benchmarks for LLMs, image gen, TTS, and video.
- **[Image Models](references/image-gen.md)** — Generate images, edit images, and analyze images with vision models.
- **[Multimodal](references/multimodal.md)** — Process images, audio, and video inputs.

## Quick Reference

```bash
# Models
or models                           # List all models
or models "coding" --tools          # Search: tool-capable coding models
or models -t text --sort price -n 10  # Top 10 cheapest text models
or show <model-id>                  # Full details with price ranges
or compare id1 id2 id3              # Side-by-side comparison

# Chat
or chat "question" -m <model-id>    # Send a message
or chat "describe" --image photo.jpg -m <model-id>  # Image analysis
or chat "transcribe" --audio recording.wav -m <model-id>  # Audio

# Benchmarks
or benchmarks --type llm --sort coding -n 10  # Best coders
or benchmarks --type text-to-image --sort score -n 5  # Best image gen
or benchmarks --type image-editing --or -n 10  # With OpenRouter IDs

# Providers & Endpoints
or endpoints <model-id>             # Per-provider uptime/latency
or providers                        # All providers with datacenters
```

## Common Mistakes

- **Always specify a model with `-m`**. Without it, a default is used which may not be optimal.
- **Model IDs include the provider prefix** — e.g. `deepseek/deepseek-v4-flash`, not just `deepseek-v4-flash`.
- **Benchmark model IDs ≠ OpenRouter model IDs.** Benchmarks from Artificial Analysis track models across many providers. Always use `or models -t <type>` to find actual OpenRouter IDs — don't assume a benchmark model name works with `or chat`.
- **Vision ≠ Generation**: Vision models understand images (image→text). They don't create them.
- **Free models have rate limits.** If you get a 429, fall back to a paid model.
- **`--quiet --no-stream`** is the most reliable pattern for agent pipelines.
