# Image Generation & Editing with `or create image`

Generate images from text prompts, or edit/transform existing images, using OpenRouter's image models.

## Basic Usage

```bash
# Generate and save
or create image "A logo of a mountain" --save logo.png

# Specify a model
or create image "A red circle" --save circle.png -m black-forest-labs/flux.2-pro

# With options
or create image "A landscape" --save landscape.png --aspect-ratio 16:9
```

## Image Editing (image-to-image)

**Pass input images with `--image`.** This is the supported way to edit, restyle, or combine images — it works, don't fall back to `or ask`:

```bash
# Edit an existing image
or create image "Make the sky purple" --image photo.jpg --save edited.png

# Restyle
or create image "Turn this into a watercolor painting" --image photo.jpg --save watercolor.png

# Combine multiple input images
or create image "Put the cat from the first image on the beach from the second" \
  --image cat.png beach.png --save combined.png
```

Use a model that accepts image input AND produces image output (e.g. `google/gemini-3.1-flash-image`, `openai/gpt-image-2`). Check with `or show <id>` — input modalities must include `image`, output modalities must include `image`. Find the best ones with `or benchmarks --type image-editing`.

## Options

| Flag | Purpose |
|------|---------|
| `-m, --model <id>` | Image model (auto-detected if omitted — but pick one deliberately) |
| `--image <paths...>` | Input image(s) for editing / image-to-image |
| `--save <path>` | Output file path (default: `output.png`) |
| `--aspect-ratio <ratio>` | Aspect ratio (e.g. 16:9, 1:1) |
| `--image-size <size>` | Image size (e.g. 1024x1024) |
| `--style <style>` | Image style |
| `--json` | Output metadata as JSON |
| `--quiet` | Suppress non-error output |

## Finding Models

```bash
or models -t image                     # All image generation models
or benchmarks --type text-to-image    # Best quality, with OpenRouter IDs inline
or benchmarks --type image-editing    # Best editing models, with OpenRouter IDs
or show google/gemini-3.1-flash-image # Check capabilities before using
```

Benchmark rows show the exact OpenRouter ID to use (green) — no manual cross-referencing needed.

## Output Formats

Most models return PNG/JPEG, but **Recraft vector models return SVG**:

| Model | Output | Save as |
|-------|--------|---------|
| `recraft/recraft-v4-vector` | SVG | `.svg` |
| `recraft/recraft-v4.1-vector` | SVG | `.svg` |
| All other models | PNG/JPEG | `.png` |

The CLI auto-detects SVG output and adjusts the file extension.

## Pricing

Two pricing types:

| Type | Example | How it works |
|------|---------|-------------|
| Token-based | GPT-5 Image Mini | Charged per 1M tokens |
| Per-image | Recraft V4.1 | Fixed price per image |

Check with `or show <model-id>`.

## Agent Patterns

```bash
# Generate and use in pipeline
or create image "A flowchart" --save flowchart.png --json | jq -r '.output'

# Silent generation
or create image "An icon" --save icon.png --quiet

# Edit pipeline: generate, then refine
or create image "A robot mascot" --save v1.png
or create image "Same robot, but waving" --image v1.png --save v2.png
```

## Notes

- **`--image` on `or create image` is for editing inputs.** `--image` on `or ask` is for *analysis* (describe/understand). Same flag name, different intent.
- **gpt-image models** route to the dedicated `/api/v1/images` endpoint automatically (including input images) — no action needed.
- **Auto-detected model** if `-m` omitted: the first suitable model, filtered to edit-capable models when `--image` is given. Prefer setting one explicitly or via `or config --set-image <id>`.
- **Parent directories** are created automatically.
- **If no image comes back**, the CLI exits 1 with the model's text response and a hint — usually the model doesn't support image output. Pick one from `or models -t image`.
