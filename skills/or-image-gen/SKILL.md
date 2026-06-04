---
name: or-image-gen
description: Find and use image generation, image editing, and vision models via OpenRouter. Use when the user wants to generate images, edit images, analyze images, describe photos, do OCR, find the best image model, or compare image model quality. Image generation requires models with image output (`or models -t image`). Image understanding requires vision models (`or models --vision`).
---

# Image Models with `or`

## Finding the Right Model Type

| Task | Filter | What it means |
|------|--------|---------------|
| Generate images from text | `or models -t image` | Text/image in, image out |
| Edit existing images | `or models -t image` | Same models (most do both) |
| Understand/analyze images | `or models --vision` | Image in, text out |
| Extract text (OCR) | `or models --vision` | Any vision model |

```bash
# Image generation models
or models -t image

# Vision models (understanding)
or models --vision

# Search for specific capabilities
or models "image editing"
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

## Common Pitfalls

- **Vision ≠ Generation**: Vision models understand images (image→text). They don't create them.
- **Modality format**: `text+image->text+image` = generates, `text+image->text` = vision only
- **Free models**: Rate-limited. For production, prefer paid models.

## Examples

```bash
# Generate
or chat "Generate a logo of a mountain" -m google/gemini-2.5-flash-image --quiet

# Understand
or chat "Describe this photo" -m openai/gpt-4o --image photo.jpg --quiet

# OCR
or chat "Extract all text" -m google/gemini-2.5-flash --image document.jpg --quiet
```
