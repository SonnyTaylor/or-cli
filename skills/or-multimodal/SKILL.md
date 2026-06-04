---
name: or-multimodal
description: Process images, audio, and video with AI models via OpenRouter. Use when the user wants to analyze images, transcribe audio, summarize videos, extract text from screenshots, describe what's in a photo, translate speech, or understand video content. Requires vision/audio/video-capable models (find with `or models --vision` or `or models -t audio`).
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
```

## Supported File Types

| Input | Formats | Flag |
|-------|---------|------|
| Images | jpg, jpeg, png, gif, webp, bmp | `--image <path>` |
| Audio | wav, mp3, m4a, flac, ogg, webm | `--audio <path>` |
| Video | mp4, webm, mov, avi, mkv | `--video <path>` |

## Finding Compatible Models

Not all models support all input types. Always check first:

```bash
# Vision models (image input)
or models --vision

# Audio-capable models
or models -t audio

# Video-capable models
or models --json | jq '.[] | select(.Modality | test("video"))'

# Check a specific model
or show google/gemini-2.5-flash
```

## Use Cases

### Image Analysis
```bash
or chat "Describe this image in detail" --image screenshot.png -m google/gemini-2.5-flash --quiet
or chat "Extract all text from this image" --image document.jpg -m google/gemini-2.5-flash --quiet
or chat "What trends do you see in this chart?" --image chart.png -m google/gemini-2.5-flash --quiet
```

### Audio Processing
```bash
or chat "Transcribe this audio verbatim" --audio recording.wav -m google/gemini-2.5-flash --quiet
or chat "Summarize the key points from this meeting" --audio meeting.mp3 -m google/gemini-2.5-flash --quiet
```

### Video Understanding
```bash
or chat "Summarize what happens in this video" --video clip.mp4 -m google/gemini-2.5-flash --quiet
or chat "Describe the main scenes" --video presentation.mp4 -m google/gemini-2.5-flash --quiet
```

## Important Notes

- **File size limits**: Very large files may hit token limits. Consider splitting long audio/video.
- **Gemini recommended**: For audio and video, Google's Gemini models have the broadest support.
- **Cost**: Multimodal inputs typically cost more than text-only due to token usage.
