# Image Generation with `or create image`

Generate images from text prompts using OpenRouter's image generation models.

## Basic Usage

```bash
# Generate and save
or create image "A logo of a mountain" --save logo.png

# Specify a model
or create image "A red circle" --save circle.png -m black-forest-labs/flux.2-pro

# With options
or create image "A landscape" --save landscape.png --aspect-ratio 16:9
```

## Options

| Flag | Purpose |
|------|---------|
| `-m, --model <id>` | Image generation model (auto-detected if omitted) |
| `--save <path>` | Output file path (default: `output.png`) |
| `--aspect-ratio <ratio>` | Aspect ratio (e.g. 16:9, 1:1) |
| `--image-size <size>` | Image size (e.g. 1024x1024) |
| `--style <style>` | Image style |
| `--json` | Output metadata as JSON |
| `--quiet` | Suppress non-error output |

## Finding Models

```bash
or models -t image                  # All image generation models
or show black-forest-labs/flux.2-pro  # Check capabilities
or benchmarks --type text-to-image --sort score -n 10  # Best quality
```

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
or create image "A icon" --save icon.png --quiet
```

## Notes

- **Auto-detects model** if `--model` is omitted (picks the first available image model).
- **Parent directories** are created automatically.
- **SVG auto-detection** adjusts file extension for vector models.
- **For image editing**, send an input image with `--image` on `or ask` and use an image editing model.
- **For image analysis**, use `or ask --image` with a vision model.
