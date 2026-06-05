# Multimodal Inputs with `or`

The `or chat` command supports sending images, audio, video, and PDF files to compatible models.

**Important: `or chat` handles INPUTS only (sending media TO a model). For OUTPUTS like generating speech audio, use the dedicated [`or tts`](tts.md) command.**

## Quick Reference

```bash
# Image analysis
or chat "What's in this image?" --image photo.jpg -m google/gemini-2.5-flash

# Audio transcription (STT — speech-to-text)
or chat "Transcribe this audio" --audio recording.wav -m google/gemini-2.5-flash

# Video summarization
or chat "Summarize this video" --video clip.mp4 -m google/gemini-2.5-flash

# PDF analysis (local file)
or chat "Summarize this document" --pdf report.pdf -m google/gemini-2.5-flash

# PDF analysis (URL)
or chat "What are the main points?" --pdf https://example.com/paper.pdf -m anthropic/claude-sonnet-4

# Text-to-speech (TTS — speech generation) — NOT via `or chat`
or tts "Hello world" -o hello.mp3 -m hexgrad/kokoro-82m
```

## Supported File Types

| Input | Formats | Flag |
|-------|---------|------|
| Images | jpg, jpeg, png, gif, webp, bmp | `--image <path>` |
| Audio | wav, mp3, m4a, flac, ogg, webm | `--audio <path>` |
| Video | mp4, webm, mov, avi, mkv | `--video <path>` |
| PDF | pdf (local or URL) | `--pdf <path>` |

## Audio: Input vs Output

Audio capabilities come in two completely different flavors:

| Direction | Command | What it does | Example model |
|-----------|---------|-------------|---------------|
| **Input** (STT) | `or chat --audio` | Sends audio TO model, gets text BACK | `google/gemini-2.5-flash` |
| **Output** (TTS) | `or tts` | Sends text TO endpoint, gets audio BACK | `hexgrad/kokoro-82m` |

**Do not confuse these.** `or chat --audio` is for transcription/understanding. `or tts` is for speech synthesis. Models that do one rarely do the other through the same interface.

### Finding Audio Input Models (STT)

Models that accept audio input and return text:

```bash
# Any model with audio in its input modalities
or models -t audio

# Then read the description to confirm it's audio->text, not something else
or show mistralai/voxtral-small-24b-2507
or show nvidia/nemotron-3-nano-omni-30b-a3b-reasoning
```

Look for modality patterns like:
- `text+file+audio->text` — takes audio, outputs text (transcription/understanding)
- `text+image+audio+video->text` — multimodal understanding including audio

### Finding Audio Output Models (TTS)

Models that generate speech from text:

```bash
# Dedicated TTS models only
or tts --list-models

# Read description to confirm
or show hexgrad/kokoro-82m
```

**Common trap:** `-t audio` includes music generation models like `google/lyria-3-*` which output songs, not speech. Always read the description.

## PDF Processing

PDFs are processed server-side by OpenRouter. Works with **any model** — even text-only models.

### Processing Engines

| Engine | Cost | Best For |
|--------|------|----------|
| `native` | Free (input tokens) | Models that support files natively (GPT-4o, Gemini, Claude) |
| `cloudflare-ai` | Free | General PDFs, default fallback |
| `mistral-ocr` | $0.001/1000 pages | Scanned documents, image-heavy PDFs |

```bash
# Let OpenRouter pick the best engine (default)
or chat "Summarize this" --pdf document.pdf -m google/gemini-2.5-flash

# Force native processing (for models that support it)
or chat "Summarize this" --pdf document.pdf --pdf-engine native -m openai/gpt-4o

# Use Mistral OCR for scanned documents
or chat "Extract text from this scan" --pdf scanned.pdf --pdf-engine mistral-ocr -m google/gemini-2.5-flash

# Use Cloudflare AI (free, good for text-heavy PDFs)
or chat "Summarize this" --pdf paper.pdf --pdf-engine cloudflare-ai -m deepseek/deepseek-v4-flash
```

### PDF URLs vs Local Files

```bash
# URL — no download needed, sent directly
or chat "Summarize" --pdf https://arxiv.org/pdf/2301.13688.pdf -m anthropic/claude-sonnet-4

# Local file — base64 encoded automatically
or chat "Summarize" --pdf ./my-document.pdf -m anthropic/claude-sonnet-4
```

### How PDFs Work

1. **Native models** (GPT-4o, Gemini, Claude): PDF is passed directly to the model
2. **Other models**: OpenRouter parses the PDF to text/images, then sends parsed content
3. **Annotations**: Parsed PDFs return file annotations that can be reused in follow-up requests to skip re-parsing

## Finding Compatible Models

Not all models support all input types. Always check first:

```bash
# Vision models (image input)
or models --vision

# Audio-capable models (input or output — CHECK DESCRIPTION)
or models -t audio

# Video-capable models
or models -t video

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
# Transcription (audio -> text)
or chat "Transcribe this audio verbatim" --audio recording.wav -m google/gemini-2.5-flash --quiet
or chat "Summarize the key points from this meeting" --audio meeting.mp3 -m google/gemini-2.5-flash --quiet

# Speech synthesis (text -> audio) — use `or tts`, NOT `or chat`
or tts "Welcome to the meeting" -m hexgrad/kokoro-82m -v af_bella -o welcome.mp3
```

### Video Understanding
```bash
or chat "Summarize what happens in this video" --video clip.mp4 -m google/gemini-2.5-flash --quiet
or chat "Describe the main scenes" --video presentation.mp4 -m google/gemini-2.5-flash --quiet
```

### PDF Analysis
```bash
# Research paper
or chat "Explain the methodology" --pdf paper.pdf -m anthropic/claude-sonnet-4

# Financial report
or chat "What were the revenue figures?" --pdf annual-report.pdf -m openai/gpt-4o

# Scanned document (use OCR)
or chat "Extract all text" --pdf scanned.pdf --pdf-engine mistral-ocr -m google/gemini-2.5-flash

# Compare multiple PDFs (send them sequentially)
or chat "Compare these two contracts" --pdf contract1.pdf -m anthropic/claude-sonnet-4
# Then: "Now compare with this one" --pdf contract2.pdf --continue

# PDF + web search for comprehensive research
or chat "Analyze this paper and find related work" --pdf paper.pdf --web-search -m openai/gpt-5.2
```

## Combining Multiple Inputs

You can send multiple file types in a single request:

```bash
# Image + text question
or chat "What does this diagram show?" --image diagram.png -m google/gemini-2.5-flash

# PDF + image
or chat "Does this image match the document?" --pdf report.pdf --image chart.png -m google/gemini-2.5-flash
```

## Important Notes

- **File size limits**: Very large files may hit token limits. Consider splitting long audio/video.
- **Gemini recommended**: For audio and video, Google's Gemini models have the broadest support.
- **PDFs work with any model**: Even text-only models can process PDFs (via server-side parsing).
- **Cost**: Multimodal inputs typically cost more than text-only due to token usage.
- **Mistral OCR costs apply to all requests**: Including BYOK (OpenRouter uses its own key).
- **Image limit**: OCR extracts at most 8 images per PDF (surplus images dropped, text preserved).
- **Audio direction matters**: `--audio` sends audio TO the model (STT). `or tts` generates audio FROM text. Don't mix these up.
