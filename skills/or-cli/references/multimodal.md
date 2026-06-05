# Multimodal Inputs

The CLI supports sending images, audio, video, and PDF files to compatible models via `or ask` (one-shot) and `or chat` (conversation).

**For outputs (generating media), use the dedicated commands:**
- `or create image` — Image generation
- `or create video` — Video generation
- `or create audio` — TTS
- `or transcribe` — Speech-to-text

## Quick Reference

```bash
# Image analysis
or ask "What's in this image?" --image photo.jpg -m xiaomi/mimo-v2.5

# Audio analysis (model interprets audio)
or ask "What is being said?" --audio recording.wav -m xiaomi/mimo-v2.5

# Video analysis
or ask "Summarize this video" --video clip.mp4 -m xiaomi/mimo-v2.5

# PDF analysis (local or URL)
or ask "Summarize this document" --pdf report.pdf -m anthropic/claude-sonnet-4

# Dedicated transcription (raw STT)
or transcribe recording.mp3 --output transcript.txt
```

## Supported File Types

| Input | Formats | Flag |
|-------|---------|------|
| Images | jpg, jpeg, png, gif, webp, bmp | `--image <path>` |
| Audio | wav, mp3, m4a, flac, ogg, webm | `--audio <path>` |
| Video | mp4, webm, mov, avi, mkv | `--video <path>` |
| PDF | pdf (local or URL) | `--pdf <path>` |

## Audio: Input vs Output

| Direction | Command | What it does |
|-----------|---------|-------------|
| **Input** (STT) | `or ask --audio` or `or transcribe` | Sends audio TO model, gets text BACK |
| **Output** (TTS) | `or create audio` | Sends text TO endpoint, gets audio BACK |

Don't confuse these. Use `or transcribe` for raw transcription, `or ask --audio` for audio analysis, and `or create audio` for speech synthesis.

## PDF Processing

PDFs work with **any model** — even text-only models. OpenRouter parses them server-side.

| Engine | Cost | Best For |
|--------|------|----------|
| `native` | Free (input tokens) | Models with native file support (GPT-4o, Gemini, Claude) |
| `cloudflare-ai` | Free | General PDFs, default fallback |
| `mistral-ocr` | $0.001/1000 pages | Scanned documents, image-heavy PDFs |

```bash
or ask "Summarize" --pdf document.pdf -m xiaomi/mimo-v2.5
or ask "Extract text" --pdf scanned.pdf --pdf-engine mistral-ocr -m xiaomi/mimo-v2.5
```

## Conversations with Multimodal Inputs

Multimodal inputs work with `or chat --conversation` and `--continue`:

```bash
or chat "Describe this" --image photo.jpg --conversation -m xiaomi/mimo-v2.5
or chat "What color was the sky?" --continue  # Model remembers the image
```

## Combining Inputs

```bash
# Image + text
or ask "What does this diagram show?" --image diagram.png -m xiaomi/mimo-v2.5

# PDF + image
or ask "Does this image match the document?" --pdf report.pdf --image chart.png -m xiaomi/mimo-v2.5
```

## Finding Compatible Models

```bash
or models --vision                  # Vision models (image input)
or models -t audio                  # Audio-capable models (input or output)
or models -t video                  # Video-capable models
or show xiaomi/mimo-v2.5            # Check specific model
```

## Notes

- **File size limits** — very large files may hit token limits.
- **Gemini recommended** for audio and video — broadest multimodal support.
- **PDFs work with any model** — server-side parsing handles it.
- **Cost** — multimodal inputs cost more than text-only due to token usage.
- **`--audio` is for analysis** — for raw transcription, use `or transcribe`.
- **`--image` is for understanding** — for image generation, use `or create image`.
