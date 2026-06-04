---
name: or-image-gen
description: Find and use image generation, image editing, and vision models via OpenRouter. Use when the user wants to generate images, edit images, analyze images, or find the best image model for a task.
---

# Image Models with `or`

The image model ecosystem is diverse — generation, editing, and vision (understanding) are all different capabilities. Never assume a model does what you need. Always verify.

## Finding Image Models

```bash
# Image generation models (text → image, or image → image)
or models -t image

# Vision models (image → text, understanding)
or models --vision

# Search for specific capabilities
or models "image editing"
or models "inpainting"
```

**Important**: `-t image` filters for models whose **output** includes image (generation/editing). `--vision` filters for models whose **input** includes image but output is text (understanding).

## Checking Capabilities

**Always verify before using an image model.** Use `or show` to see the full description:

```bash
or show openai/gpt-5-image-mini
or show google/gemini-3.1-flash-image-preview
```

Key things to check:
- **Modality**: `text+image->text+image` (generates + edits), `text+image->text` (vision only)
- **Description**: May mention SVG, vector, editing, inpainting, specific aspect ratios, etc.
- **Parameters**: Look for image-specific parameters in supported parameters

## Image Generation Benchmarks

Use Artificial Analysis ELO ratings to find quality models:

```bash
# Text-to-image quality rankings
or benchmarks --type text-to-image --sort score -n 10

# Image editing quality rankings
or benchmarks --type image-editing --sort score -n 10
```

## Provider Reliability for Image Models

Image models often have varying quality across providers. Check endpoint reliability:

```bash
or endpoints <model-id> --sort uptime
or endpoints <model-id> --min-uptime 98
```

## Common Pitfalls

1. **Editing vs Generation**: Some models accept an input image to edit. Others only generate from text. Check modality.
2. **Vision ≠ Generation**: Vision models *understand* images (image→text). They don't create them.
3. **Free models**: Rate-limited. For production use, prefer paid models.
4. **Price ranges**: Image model prices vary significantly by provider. Use `or show` to see ranges.

## Agent Workflow for Image Tasks

```bash
# 1. What kind of image task?
#    - Generate from text? → or models -t image
#    - Edit existing image? → or models "image editing"
#    - Understand/describe image? → or models --vision

# 2. Check benchmarks for quality
or benchmarks --type text-to-image -n 5

# 3. Verify the model does what you think
or show <model-id>

# 4. Check provider reliability
or endpoints <model-id> --min-uptime 98 --sort latency
```
