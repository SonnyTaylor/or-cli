# Benchmarks with `or`

Powered by [Artificial Analysis](https://artificialanalysis.ai) independent benchmarks.

## Setup

```bash
or auth --aa-key <your-key>   # Get key at https://artificialanalysis.ai/login
```

**Rate limit: 1000 requests/day.** Responses cached for 24 hours, so day-to-day use costs ~1 request.

## OpenRouter IDs Are Automatic

When an OpenRouter key is configured (it almost always is), every benchmark row is
**automatically matched to its OpenRouter model ID** — shown green in the table,
`openrouter_id` in JSON. Use that ID directly with `-m`:

```bash
or benchmarks -n 10                 # Top LLMs by intelligence, with OR IDs
or benchmarks --type text-to-image -n 10 --json | jq -r '.[].openrouter_id'
```

Rows showing `—` are not available on OpenRouter. Disable the column with `--no-or`.

## Available Categories

```bash
or benchmarks --list-types
```

| Category | What it measures |
|----------|-----------------|
| `llm` | Intelligence, coding, math, speed, TTFT (15 benchmarks) |
| `text-to-image` | Image generation quality (ELO) |
| `image-editing` | Image editing quality (ELO) |
| `text-to-speech` | TTS quality (ELO) |
| `text-to-video` | Video generation quality (ELO) |
| `image-to-video` | Image-to-video quality (ELO) |

## LLM Benchmarks

```bash
or benchmarks -n 10                               # Smartest (default: intelligence)
or benchmarks --sort coding -n 10                 # Best coders
or benchmarks --sort speed -n 10                  # Fastest
or benchmarks --sort price -n 10                  # Best value
or benchmarks --detailed -n 5                     # All 15 columns
or benchmarks --json                              # Machine-readable JSON
```

Note: AA benchmarks the same model at multiple reasoning efforts — "GPT-5.5 (xhigh)"
and "GPT-5.5 (medium)" are separate rows mapping to the same OpenRouter ID.

### 15 LLM Evaluations

Intelligence Index, Coding Index, Math Index, MMLU Pro, GPQA, HLE, LiveCodeBench, SciCode, MATH 500, AIME, AIME 25, IFBench, LCR, TerminalBench, TAU2

### Speed Metrics

- **Speed**: Output tokens per second
- **TTFT**: Time to first token (latency)

## Media Benchmarks (ELO Ratings)

```bash
or benchmarks --type text-to-image -n 5
or benchmarks --type image-editing -n 5
or benchmarks --type text-to-speech -n 5
or benchmarks --type text-to-video -n 5
```

## Sort Options

LLM: `intelligence` (default), `coding`, `math`, `speed`, `ttft`, `price`, `name`
Media: `score` (ELO, default), `appearances`, `name`

## Notes

- ELO ratings are category-relative (1200 in image ≠ 1200 in video)
- Speed varies by provider
- `or models` also shows benchmark scores inline automatically — you rarely need
  a separate benchmarks call just to pick a model
- `--json` for machine-readable output, `--quiet` for minimal output
