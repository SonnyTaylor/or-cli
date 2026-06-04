---
name: or-multimodal
description: Use multimodal inputs (images, audio, video) with AI models via OpenRouter. Use when the user wants to analyze images, transcribe audio, summarize videos, or process any non-text content.
---

# Multimodal Inputs with `or`

The `or chat` command supports sending images, audio, and video files to compatible models.

## Quick Reference

```bash
# Image analysis
or chat "What's in this image?" --image photo.jpg -m google/gemini-2.5-flash

# Audio transcription
or chat "Transcribe this audio" --audio recording.wav -m google/gemini-2.5-flash

# Video summarization
or chat "Summarize this video" --video clip.mp4 -m google/gemini-2.5-flash

# Combine multiple inputs
or chat "Compare the image with the audio description" --image photo.jpg --audio description.wav -m google/gemini-2.5-flash
```

## Supported File Types

| Input | Formats | Flag |
|-------|---------|------|
| Images | jpg, jpeg, png, gif, webp, bmp | `--image <path>` |
| Audio | wav, mp3, m4a, flac, ogg, webm | `--audio <path>` |
| Video | mp4, webm, mov, avi, mkv | `--video <path>` |

## Model Requirements

Not all models support all input types. Use `or models` to find compatible models:

```bash
# Find models that accept video input
or models -t vision --json | jq '.[] | select(.Modality | test("video"))'

# Find models that accept audio input
or models --json | jq '.[] | select(.Modality | test("audio"))'

# Check a specific model's capabilities
or show google/gemini-2.5-flash
```

**Best models for multimodal:**
- **Gemini 2.5 Flash** — accepts image, audio, video, file inputs
- **Gemini 3 Pro** — accepts image, audio, video, file inputs
- **GPT-4o** — accepts image inputs
- **Claude 3.5** — accepts image inputs

## Use Cases for Agents

### Image Analysis
```bash
# Describe an image
or chat "Describe this image in detail" --image screenshot.png -m google/gemini-2.5-flash --quiet

# Extract text from image (OCR)
or chat "Extract all text from this image" --image document.jpg -m google/gemini-2.5-flash --quiet

# Analyze a chart/graph
or chat "What trends do you see in this chart?" --image chart.png -m google/gemini-2.5-flash --quiet

# Compare images
or chat "What are the differences between these images?" --image before.jpg --image after.jpg -m google/gemini-2.5-flash
```

### Audio Processing
```bash
# Transcribe audio
or chat "Transcribe this audio verbatim" --audio recording.wav -m google/gemini-2.5-flash --quiet

# Summarize a meeting
or chat "Summarize the key points from this meeting" --audio meeting.mp3 -m google/gemini-2.5-flash --quiet

# Translate audio
or chat "Translate this audio to English" --audio foreign.wav -m google/gemini-2.5-flash --quiet
```

### Video Understanding
```bash
# Summarize a video
or chat "Summarize what happens in this video" --video clip.mp4 -m google/gemini-2.5-flash --quiet

# Extract key frames
or chat "Describe the main scenes in this video" --video presentation.mp4 -m google/gemini-2.5-flash --quiet

# Analyze video content
or chat "What product is being demonstrated in this video?" --video demo.mp4 -m google/gemini-2.5-flash --quiet
```

## Agent Workflow

```bash
# 1. Find a model that supports your input type
or models --json | jq '.[] | select(.Modality | test("video"))'

# 2. Verify capabilities
or show google/gemini-2.5-flash

# 3. Process the file
or chat "Your prompt here" --video file.mp4 -m google/gemini-2.5-flash --quiet --no-stream

# 4. Pipe output to other tools
or chat "Extract data as JSON" --image table.png -m google/gemini-2.5-flash --quiet --no-stream | jq '.data'
```

## Important Notes

- **File size limits**: Very large files may hit token limits. Consider splitting long audio/video.
- **Base64 encoding**: Files are encoded as base64 in the request, which increases payload size.
- **Model availability**: Not all models support all modalities. Always check with `or show` first.
- **Cost**: Multimodal inputs typically cost more than text-only due to token usage.
- **Rate limits**: Free models have stricter rate limits for multimodal inputs.
- **Gemini recommended**: For audio and video, Google's Gemini models have the broadest support.
