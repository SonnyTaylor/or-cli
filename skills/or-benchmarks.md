---
name: or-benchmarks
description: Query Artificial Analysis benchmark data for AI models. Use when comparing model quality, speed, or cost-effectiveness. Covers LLMs, image generation, image editing, TTS, and video models.
---

# Benchmarks with `or`

Powered by [Artificial Analysis](https://artificialanalysis.ai) independent benchmarks. Use this to make quality-informed model choices, not just price-based ones.

## Setup

Requires an Artificial Analysis API key:
```bash
or auth --aa-key <your-key>
```

Get a key at: https://artificialanalysis.ai/login

**Rate limit: 1000 requests/day.** Responses are cached for 24 hours. Use `--no-cache` sparingly.

## Available Categories

```bash
or benchmarks --list-types
```

| Category | What it measures |
|----------|-----------------|
| `llm` | Intelligence, coding, math, speed, TTFT |
| `text-to-image` | Image generation quality (ELO) |
| `image-editing` | Image editing quality (ELO) |
| `text-to-speech` | TTS quality (ELO) |
| `text-to-video` | Video generation quality (ELO) |
| `image-to-video` | Image-to-video quality (ELO) |

## LLM Benchmarks

```bash
# Top models by coding ability
or benchmarks --type llm --sort score -n 10

# Fastest models
or benchmarks --type llm --sort speed -n 10

# Best value (quality per dollar)
or benchmarks --type llm --sort price -n 10

# Full data as JSON
or benchmarks --type llm --json
```

### LLM Metrics

| Metric | What it means |
|--------|--------------|
| `coding_index` | Artificial Analysis coding benchmark score |
| `intelligence_index` | General intelligence evaluation |
| `math_index` | Mathematical reasoning |
| `mmlu_pro` | Massive multitask language understanding |
| `gpqa` | Graduate-level science QA |
| `livecodebench` | Live coding benchmark |
| Speed (t/s) | Output tokens per second |
| TTFT | Time to first token (latency) |

## Media Benchmarks (Image, Video, Audio)

All media benchmarks use **ELO ratings** — higher is better. Scores are relative to other models in the same category.

```bash
# Best image generators
or benchmarks --type text-to-image --sort score -n 5

# Best image editors
or benchmarks --type image-editing --sort score -n 5

# Best TTS models
or benchmarks --type text-to-speech --sort score -n 5

# Best video generators
or benchmarks --type text-to-video --sort score -n 5
```

## Combining with OpenRouter Data

Use benchmarks alongside `or models` to find models that are both available on OpenRouter AND high-quality:

```bash
# 1. Get benchmark rankings
or benchmarks --type text-to-image --json > /tmp/aa-img.json

# 2. Check which are available on OpenRouter
or models -t image --json > /tmp/or-img.json

# 3. Cross-reference (agent can do this programmatically)
```

Or simpler — use `--benchmarks` on `or models` to inline AA scores:
```bash
or models --benchmarks --sort price -n 10
```

## Notes

- **ELO ratings are category-relative.** A 1200 in text-to-image ≠ 1200 in video.
- **Speed varies by provider.** AA benchmarks measure specific provider endpoints; OpenRouter may route differently.
- **Free tier rate limit.** 1000/day. Cache aggressively. Don't poll repeatedly.
- **Attribution required.** When sharing benchmark data, credit Artificial Analysis.
