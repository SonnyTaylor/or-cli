# Image Models with `or`

## Finding the Right Model Type

| Task | Filter | What it means |
|------|--------|---------------|
| Generate images from text | `or models -t image` | Text/image in, image out |
| Edit existing images | `or models -t image` | Same models (most do both) |
| Understand/analyze images | `or models --vision` | Image in, text out |
| Extract text (OCR) | `or models --vision` | Any vision model |

## Pricing Types

Image models have two pricing types:

| Type | Display | Example | How it works |
|------|---------|---------|---------------|
| Token-based | `$2.38` | GPT-5 Image Mini | Charged per 1M tokens (input + output) |
| Per-image | `$0.04/img` | Recraft V4.1 | Fixed price per generated image |

Per-image models (Recraft, xAI Grok, Microsoft MAI, Sourceful) are often cheaper for single images but don't support token-based cost optimization.

## Output Formats

Most models return raster images (PNG/JPEG), but **Recraft vector models return SVG**:

| Model | Output | Use `--save` with |
|-------|--------|-------------------|
| `recraft/recraft-v4-vector` | SVG | `.svg` |
| `recraft/recraft-v4.1-vector` | SVG | `.svg` |
| `recraft/recraft-v4-pro-vector` | SVG | `.svg` |
| `recraft/recraft-v4.1-pro-vector` | SVG | `.svg` |
| All other image models | PNG/JPEG | `.png` |

Vector models are ideal for logos, icons, and UI assets — output is infinitely scalable.

```bash
# Image generation models (all 30+ models including Recraft, FLUX, xAI, etc.)
or models -t image

# Vision models (understanding only, no generation)
or models --vision

# Search for specific capabilities
or models "image editing"
or models "recraft"
or models "flux"
```

## Checking Capabilities

Always verify before using an image model:

```bash
or show openai/gpt-5-image-mini
or show google/gemini-3.1-flash-image-preview
```

## Quality Benchmarks

```bash
or benchmarks --type text-to-image --sort score -n 10
or benchmarks --type image-editing --sort score -n 10
```

**Warning:** Benchmark model IDs (e.g. `black-forest-labs/flux-2-max`) are from Artificial Analysis and may not exist on OpenRouter. Always use `or models -t image` to get the actual available model IDs.

## Common Pitfalls

- **Vision ≠ Generation**: Vision models understand images (image→text). They don't create them.
- **Modality format**: `text+image->text+image` = generates, `text+image->text` = vision only
- **Free models**: Rate-limited. For production, prefer paid models.

## Examples

```bash
# Generate and save image
or chat "Generate a logo of a mountain" -m google/gemini-2.5-flash-image --save logo.png --no-stream

# Edit image and save
or chat "Replace the window with a door" --image input.jpg -m google/gemini-2.5-flash-image --save output.png --no-stream

# Understand (text output only)
or chat "Describe this photo" -m openai/gpt-4o --image photo.jpg --quiet

# OCR
or chat "Extract all text" -m google/gemini-2.5-flash --image document.jpg --quiet
```

## Saving Generated Images

Use `--save <path>` to save images directly to disk:

```bash
or chat "Generate a red circle" -m google/gemini-2.5-flash-image --save circle.png --no-stream
```

Output:
```
✓ Image saved to /path/to/circle.png (180KB)
Sure, here's your red circle:

  1313 tokens (8 in / 1305 out) • 224 tps • 5.8s • $0.0387 • google/gemini-2.5-flash-image • Google • 1290 img tokens
```

The `--save` flag:
- Auto-detects format from the model's output (PNG, JPEG, etc.)
- Creates parent directories if needed
- Shows file size in output
- Works with `--quiet` (still saves, just suppresses text)
