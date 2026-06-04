# Benchmarks with `or`

Powered by [Artificial Analysis](https://artificialanalysis.ai) independent benchmarks.

## Setup

```bash
or auth --aa-key <your-key>   # Get key at https://artificialanalysis.ai/login
```

**Rate limit: 1000 requests/day.** Responses cached for 24 hours.

## Available Categories

```bash
or benchmarks --list-types
```

| Category | What it measures |
|----------|-----------------|
| `llm` | Intelligence, coding, math, speed, TTFT (15 benchmarks) |
| `text-to-image` | Image generation quality (ELO, 142 models) |
| `image-editing` | Image editing quality (ELO, 64 models) |
| `text-to-speech` | TTS quality (ELO, 84 models) |
| `text-to-video` | Video generation quality (ELO, 83 models) |
| `image-to-video` | Image-to-video quality (ELO, 76 models) |

## LLM Benchmarks

```bash
or benchmarks --type llm --sort coding -n 10     # Best coders
or benchmarks --type llm --sort speed -n 10       # Fastest
or benchmarks --type llm --sort price -n 10       # Best value
or benchmarks --type llm --detailed -n 5          # All 15 columns
```

### 15 LLM Evaluations

Intelligence Index, Coding Index, Math Index, MMLU Pro, GPQA, HLE, LiveCodeBench, SciCode, MATH 500, AIME, AIME 25, IFBench, LCR, TerminalBench, TAU2

### Speed Metrics

- **Speed**: Output tokens per second
- **TTFT**: Time to first token (latency)

## Media Benchmarks (ELO Ratings)

```bash
or benchmarks --type text-to-image --sort score -n 5
or benchmarks --type image-editing --sort score -n 5
or benchmarks --type text-to-speech --sort score -n 5
or benchmarks --type text-to-video --sort score -n 5
```

## Sort Options

`score`, `coding`, `intelligence`, `math`, `speed`, `ttft`, `price`, `name`

## Notes

- **Benchmark model IDs ≠ OpenRouter model IDs.** Benchmarks come from Artificial Analysis which tracks models across many providers. A model like `black-forest-labs/flux-2-max` in benchmarks may not exist on OpenRouter. Always use `or models -t <type>` to find the actual OpenRouter model IDs.
- ELO ratings are category-relative (1200 in image ≠ 1200 in video)
- Speed varies by provider
- Use `or models --benchmarks` to inline AA scores in model listings
